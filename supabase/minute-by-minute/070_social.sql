-- 070: Social (Nov 23). Usernames, friends (request + accept), blocking, and what others see.
-- Run after 069. Safe to run again.
--
-- What others see is yours to pick (profiles.share), each item one of:
--   now   (your current job)       nobody | friends | anyone
--   bar   (the day bar)            nobody | friends | anyone
--   stats (time spent, by job)     nobody | friends | anyone
--   days  (days you pin to share)  nobody | friends | anyone
--   map   (stops and routes)       nobody | trusted   (only friends you mark trusted)
-- Name and picture always show. Everything starts as nobody. A job or category marked private
-- shows to others as "Busy", in grey.
--
-- Nobody reads anyone else's tables directly: everything goes through the functions below,
-- which check friendship, blocks and these settings first.

alter table profiles add column if not exists username text;
create unique index if not exists profiles_username on profiles (lower(username)) where username is not null;
alter table profiles add column if not exists share jsonb not null default '{}'::jsonb;
alter table activities add column if not exists private boolean not null default false;
alter table categories add column if not exists private boolean not null default false;

create table if not exists friend_requests (
  from_id uuid not null references auth.users on delete cascade,
  to_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_id, to_id)
);
alter table friend_requests enable row level security;
drop policy if exists "own requests" on friend_requests;
create policy "own requests" on friend_requests for select to authenticated using (from_id = auth.uid() or to_id = auth.uid());

-- One row each way: yours says whether you trust them (they see your map, if you share it).
create table if not exists friends (
  user_id uuid not null references auth.users on delete cascade,
  friend_id uuid not null references auth.users on delete cascade,
  trusted boolean not null default false,
  since timestamptz not null default now(),
  primary key (user_id, friend_id)
);
alter table friends enable row level security;
drop policy if exists "own friends" on friends;
create policy "own friends" on friends for select to authenticated using (user_id = auth.uid());

create table if not exists user_blocks (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  blocked_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id)
);
alter table user_blocks enable row level security;
drop policy if exists "own blocks" on user_blocks;
create policy "own blocks" on user_blocks for select to authenticated using (user_id = auth.uid());

-- Days you pinned for others to see (the days setting says who).
create table if not exists shared_days (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  primary key (user_id, day)
);
alter table shared_days enable row level security;
drop policy if exists "own shared days" on shared_days;
create policy "own shared days" on shared_days for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Helpers ----------

create or replace function social_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_blocks where (user_id = a and blocked_id = b) or (user_id = b and blocked_id = a));
$$;

create or replace function social_relation(me uuid, them uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when me = them then 'self'
    when social_blocked(me, them) then 'blocked'
    when exists (select 1 from friends where user_id = me and friend_id = them) then 'friend'
    when exists (select 1 from friend_requests where from_id = me and to_id = them) then 'sent'
    when exists (select 1 from friend_requests where from_id = them and to_id = me) then 'received'
    else 'none' end;
$$;

-- May viewer see owner's item?
create or replace function social_can_see(owner uuid, viewer uuid, item text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_set text;
begin
  if owner = viewer then return true; end if;
  if viewer is null or social_blocked(owner, viewer) then return false; end if;
  select coalesce(share->>item, 'nobody') into v_set from profiles where user_id = owner;
  if item = 'map' then
    return v_set = 'trusted' and exists (select 1 from friends where user_id = owner and friend_id = viewer and trusted);
  end if;
  return v_set = 'anyone' or (v_set = 'friends' and exists (select 1 from friends where user_id = owner and friend_id = viewer));
end $$;

-- A person's card: who they are and how they relate to you.
create or replace function social_card(them uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.user_id, 'username', p.username, 'name', coalesce(nullif(p.name, ''), p.username), 'avatar', p.avatar,
                            'relation', social_relation(auth.uid(), p.user_id),
                            'trusted', coalesce((select trusted from friends where user_id = auth.uid() and friend_id = p.user_id), false))
  from profiles p where p.user_id = them;
$$;

-- ---------- Your username and what you share ----------

-- null: saved. Otherwise why not.
create or replace function set_username(p_username text) returns text
language plpgsql security definer set search_path = public as $$
declare
  u text := lower(btrim(coalesce(p_username, ''), ' @'));
begin
  if auth.uid() is null then return 'Sign in first.'; end if;
  if u !~ '^[a-z0-9_.]{3,20}$' then return 'Use 3 to 20 letters, numbers, dots or underscores.'; end if;
  if exists (select 1 from profiles where lower(username) = u and user_id <> auth.uid()) then return 'That username is taken.'; end if;
  insert into profiles (user_id, username) values (auth.uid(), u)
    on conflict (user_id) do update set username = excluded.username, updated_at = now();
  return null;
end $$;

create or replace function set_share(p_share jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v jsonb := '{}'::jsonb;
  k text;
begin
  if auth.uid() is null then return; end if;
  foreach k in array array['now', 'bar', 'stats', 'days'] loop
    v := v || jsonb_build_object(k, case when p_share->>k in ('friends', 'anyone') then p_share->>k else 'nobody' end);
  end loop;
  v := v || jsonb_build_object('map', case when p_share->>'map' = 'trusted' then 'trusted' else 'nobody' end);
  insert into profiles (user_id, share) values (auth.uid(), v)
    on conflict (user_id) do update set share = excluded.share, updated_at = now();
end $$;

-- ---------- Finding people ----------

-- By username (start of it) or name (any part). Only people with a username can be found; not
-- you, and nobody either of you blocked.
create or replace function search_users(p_q text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  q text := lower(btrim(coalesce(p_q, ''), ' @'));
begin
  if auth.uid() is null or length(q) < 2 then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(social_card(p.user_id) order by (lower(p.username) = q) desc, (lower(p.username) like q || '%') desc, p.username)
    from profiles p
    where p.username is not null and p.user_id <> auth.uid() and not social_blocked(auth.uid(), p.user_id)
      and (lower(p.username) like q || '%' or p.name ilike '%' || q || '%')
    limit 20
  ), '[]'::jsonb);
end $$;

-- ---------- Friends ----------

-- 'sent', 'friends' (they'd asked you already: now you're friends), or why not.
create or replace function friend_request(p_to uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return 'Sign in first.'; end if;
  if p_to = auth.uid() or social_blocked(auth.uid(), p_to) or not exists (select 1 from profiles where user_id = p_to) then return 'not found'; end if;
  if exists (select 1 from friends where user_id = auth.uid() and friend_id = p_to) then return 'friends'; end if;
  if exists (select 1 from friend_requests where from_id = p_to and to_id = auth.uid()) then
    perform answer_request(p_to, true);
    return 'friends';
  end if;
  insert into friend_requests (from_id, to_id) values (auth.uid(), p_to) on conflict do nothing;
  return 'sent';
end $$;

create or replace function answer_request(p_from uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if not exists (select 1 from friend_requests where from_id = p_from and to_id = auth.uid()) then return; end if;
  delete from friend_requests where (from_id = p_from and to_id = auth.uid()) or (from_id = auth.uid() and to_id = p_from);
  if p_accept and not social_blocked(auth.uid(), p_from) then
    insert into friends (user_id, friend_id) values (auth.uid(), p_from), (p_from, auth.uid()) on conflict do nothing;
  end if;
end $$;

create or replace function cancel_request(p_to uuid) returns void
language sql security definer set search_path = public as $$
  delete from friend_requests where from_id = auth.uid() and to_id = p_to;
$$;

create or replace function unfriend(p_them uuid) returns void
language sql security definer set search_path = public as $$
  delete from friends where (user_id = auth.uid() and friend_id = p_them) or (user_id = p_them and friend_id = auth.uid());
$$;

create or replace function set_trusted(p_them uuid, p_trusted boolean) returns void
language sql security definer set search_path = public as $$
  update friends set trusted = p_trusted where user_id = auth.uid() and friend_id = p_them;
$$;

-- Blocking ends the friendship and any requests, and you can't find each other.
create or replace function block_user(p_them uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_them = auth.uid() then return; end if;
  perform unfriend(p_them);
  delete from friend_requests where (from_id = auth.uid() and to_id = p_them) or (from_id = p_them and to_id = auth.uid());
  insert into user_blocks (user_id, blocked_id) values (auth.uid(), p_them) on conflict do nothing;
end $$;

create or replace function unblock_user(p_them uuid) returns void
language sql security definer set search_path = public as $$
  delete from user_blocks where user_id = auth.uid() and blocked_id = p_them;
$$;

-- Everything for the Social tab: you, your friends, requests both ways, who you blocked.
create or replace function my_social() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'me', (select jsonb_build_object('username', username, 'name', name, 'avatar', avatar, 'share', share) from profiles where user_id = auth.uid()),
    'friends', coalesce((select jsonb_agg(social_card(friend_id) order by since desc) from friends where user_id = auth.uid()), '[]'::jsonb),
    'incoming', coalesce((select jsonb_agg(social_card(from_id) || jsonb_build_object('at', created_at) order by created_at desc) from friend_requests where to_id = auth.uid()), '[]'::jsonb),
    'outgoing', coalesce((select jsonb_agg(social_card(to_id) order by created_at desc) from friend_requests where from_id = auth.uid()), '[]'::jsonb),
    'blocked', coalesce((select jsonb_agg(jsonb_build_object('id', b.blocked_id, 'username', p.username, 'name', coalesce(nullif(p.name, ''), p.username), 'avatar', p.avatar))
                         from user_blocks b left join profiles p on p.user_id = b.blocked_id where b.user_id = auth.uid()), '[]'::jsonb),
    'pinned', coalesce((select jsonb_agg(day order by day desc) from shared_days where user_id = auth.uid()), '[]'::jsonb)
  );
$$;

-- ---------- Someone's profile ----------

-- What you may see of them for a day (today unless you ask for one of their pinned days): their
-- card, then each item they share with you. Private jobs are "Busy". null: not found / blocked.
create or replace function social_profile(p_user uuid, p_day date default null, p_tz text default 'America/Chicago') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  tz text := coalesce(nullif(p_tz, ''), 'America/Chicago');
  today date := (now() at time zone tz)::date;
  d date := coalesce(p_day, today);
  d_from timestamptz;
  d_to timestamptz;
  out jsonb;
  pinned jsonb := '[]'::jsonb;
  can_days boolean;
begin
  if me is null or social_blocked(me, p_user) or not exists (select 1 from profiles where user_id = p_user) then return null; end if;
  can_days := social_can_see(p_user, me, 'days');
  if can_days then
    select coalesce(jsonb_agg(day order by day desc), '[]'::jsonb) into pinned from shared_days where user_id = p_user and day < today;
  end if;
  -- Another day: only one they pinned, and only if they share pinned days with you.
  if d <> today and not (can_days and exists (select 1 from shared_days where user_id = p_user and day = d)) then
    d := today;
  end if;
  d_from := (d::timestamp) at time zone tz;
  d_to := ((d + 1)::timestamp) at time zone tz;
  out := social_card(p_user) || jsonb_build_object('day', d, 'today', d = today, 'pinned', pinned,
           'sees', jsonb_build_object('now', social_can_see(p_user, me, 'now'), 'bar', social_can_see(p_user, me, 'bar'),
                                      'stats', social_can_see(p_user, me, 'stats'), 'map', social_can_see(p_user, me, 'map')));

  if d = today and social_can_see(p_user, me, 'now') then
    out := out || jsonb_build_object('now', (
      select jsonb_build_object('name', case when a.private or c.private then 'Busy' else coalesce(a.name, 'Something') end,
                                'color', case when a.private or c.private then '#b9ab9b' else coalesce(a.color, '#b9ab9b') end,
                                'since', b.started_at)
      from blocks b left join activities a on a.id = b.activity_id left join categories c on c.id = a.category_id
      where b.user_id = p_user and b.ended_at is null order by b.started_at desc limit 1));
  end if;

  if social_can_see(p_user, me, 'bar') then
    out := out || jsonb_build_object('bar', coalesce((
      select jsonb_agg(jsonb_build_object('start', greatest(b.started_at, d_from), 'end', least(coalesce(b.ended_at, now()), d_to),
                                          'name', case when a.private or c.private then 'Busy' else coalesce(a.name, 'Something') end,
                                          'color', case when a.private or c.private then '#b9ab9b' else coalesce(a.color, '#b9ab9b') end)
                       order by b.started_at)
      from blocks b left join activities a on a.id = b.activity_id left join categories c on c.id = a.category_id
      where b.user_id = p_user and b.started_at < d_to and coalesce(b.ended_at, now()) > d_from), '[]'::jsonb));
  end if;

  if social_can_see(p_user, me, 'stats') then
    out := out || jsonb_build_object('stats', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'color', color, 'seconds', seconds) order by seconds desc)
      from (
        select case when a.private or c.private then 'Busy' else coalesce(a.name, 'Something') end as name,
               min(case when a.private or c.private then '#b9ab9b' else coalesce(a.color, '#b9ab9b') end) as color,
               sum(extract(epoch from least(coalesce(b.ended_at, now()), d_to) - greatest(b.started_at, d_from)))::int as seconds
        from blocks b left join activities a on a.id = b.activity_id left join categories c on c.id = a.category_id
        where b.user_id = p_user and b.started_at < d_to and coalesce(b.ended_at, now()) > d_from
        group by 1
      ) t where seconds > 0), '[]'::jsonb));
  end if;

  -- The map: stops (named by place) and the route dots, thinned to at most ~1500.
  if social_can_see(p_user, me, 'map') then
    out := out || jsonb_build_object(
      'stops', coalesce((
        select jsonb_agg(jsonb_build_object('arrived', v.arrived_at, 'departed', v.departed_at, 'lat', coalesce(pl.lat, v.lat), 'lng', coalesce(pl.lng, v.lng),
                                            'name', coalesce(pl.name, v.auto_name)) order by v.arrived_at)
        from visits v left join places pl on pl.id = v.place_id
        where v.user_id = p_user and v.arrived_at < d_to and coalesce(v.departed_at, now()) > d_from), '[]'::jsonb),
      'route', coalesce((
        select jsonb_agg(jsonb_build_array(round(lat::numeric, 6), round(lng::numeric, 6), at) order by at)
        from (
          select lat, lng, at, row_number() over (order by at) as n, count(*) over () as total
          from points where user_id = p_user and at >= d_from and at < d_to and coalesce(accuracy_m, 0) <= 65
        ) t where (n - 1) % greatest(1, ceil(total / 1500.0)::int) = 0), '[]'::jsonb));
  end if;
  return out;
end $$;

-- The phone's check-in: requests waiting for you (it notifies once for each).
create or replace function incoming_requests() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(social_card(from_id) || jsonb_build_object('at', created_at) order by created_at), '[]'::jsonb)
  from friend_requests where to_id = auth.uid();
$$;

do $$
declare f text;
begin
  foreach f in array array['social_blocked(uuid,uuid)', 'social_relation(uuid,uuid)', 'social_can_see(uuid,uuid,text)', 'social_card(uuid)',
                           'set_username(text)', 'set_share(jsonb)', 'search_users(text)', 'friend_request(uuid)', 'answer_request(uuid,boolean)',
                           'cancel_request(uuid)', 'unfriend(uuid)', 'set_trusted(uuid,boolean)', 'block_user(uuid)', 'unblock_user(uuid)',
                           'my_social()', 'social_profile(uuid,date,text)', 'incoming_requests()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
