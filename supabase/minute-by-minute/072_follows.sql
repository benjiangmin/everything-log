-- 072: Social switches from friends to follows (Nov 23). Run after 071. Safe to run again.
--
-- You follow someone by asking; they approve each follower. Following is one way: they don't
-- follow you back unless they ask too. Your close friends are followers you pick.
-- Friends carry over: each pair now follows each other, and anyone you trusted is a close friend.
-- Pending friend requests carry over as follow requests.
--
-- What others see (profiles.share), each item one of:
--   now, bar, stats, days   nobody | mutuals (you follow each other) | followers | anyone
--   map                     nobody | close (your close friends)
-- (Old settings: friends → followers, trusted → close.)

-- ---------- Tables ----------

-- follower follows followee. close: the followee put this follower on their close friends.
create table if not exists follows (
  follower_id uuid not null references auth.users on delete cascade,
  followee_id uuid not null references auth.users on delete cascade,
  close boolean not null default false,
  since timestamptz not null default now(),
  primary key (follower_id, followee_id)
);
create index if not exists follows_followee on follows (followee_id);
alter table follows enable row level security;
drop policy if exists "own follows" on follows;
create policy "own follows" on follows for select to authenticated using (follower_id = auth.uid() or followee_id = auth.uid());

-- from_id asks to follow to_id.
create table if not exists follow_requests (
  from_id uuid not null references auth.users on delete cascade,
  to_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_id, to_id)
);
alter table follow_requests enable row level security;
drop policy if exists "own follow requests" on follow_requests;
create policy "own follow requests" on follow_requests for select to authenticated using (from_id = auth.uid() or to_id = auth.uid());

-- ---------- Carry over friends (only while the old tables are still here) ----------

do $$
begin
  if to_regclass('public.friends') is not null then
    -- A friends row (A, B, trusted): A's friend B, trusted by A → B follows A (close if trusted).
    insert into follows (follower_id, followee_id, close, since)
      select friend_id, user_id, trusted, since from friends
      on conflict (follower_id, followee_id) do update set close = follows.close or excluded.close;
    drop table friends cascade;
  end if;
  if to_regclass('public.friend_requests') is not null then
    insert into follow_requests (from_id, to_id, created_at) select from_id, to_id, created_at from friend_requests on conflict do nothing;
    drop table friend_requests cascade;
  end if;
end $$;

update profiles set share = (
  select coalesce(jsonb_object_agg(k, case v when 'friends' then 'followers' when 'trusted' then 'close' else v end), '{}'::jsonb)
  from jsonb_each_text(share) as e(k, v))
where share::text like '%friends%' or share::text like '%trusted%';

drop function if exists friend_request(uuid);
drop function if exists unfriend(uuid);
drop function if exists set_trusted(uuid, boolean);
drop function if exists social_relation(uuid, uuid);

-- ---------- Helpers ----------

create or replace function social_follows(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from follows where follower_id = a and followee_id = b);
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
    return v_set = 'close' and exists (select 1 from follows where follower_id = viewer and followee_id = owner and close);
  end if;
  return v_set = 'anyone'
      or (v_set = 'followers' and social_follows(viewer, owner))
      or (v_set = 'mutuals' and social_follows(viewer, owner) and social_follows(owner, viewer));
end $$;

-- A person's card, from your side: who they are, their counts, and how you two are linked.
create or replace function social_card(them uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.user_id, 'username', p.username, 'name', coalesce(nullif(p.name, ''), p.username), 'avatar', p.avatar,
    'relation', case when p.user_id = auth.uid() then 'self' when social_blocked(auth.uid(), p.user_id) then 'blocked' else 'none' end,
    'following', social_follows(auth.uid(), p.user_id),
    'follows_me', social_follows(p.user_id, auth.uid()),
    'requested', exists (select 1 from follow_requests where from_id = auth.uid() and to_id = p.user_id),
    'requested_me', exists (select 1 from follow_requests where from_id = p.user_id and to_id = auth.uid()),
    'close', coalesce((select close from follows where follower_id = p.user_id and followee_id = auth.uid()), false),
    'followers', (select count(*) from follows where followee_id = p.user_id),
    'following_count', (select count(*) from follows where follower_id = p.user_id))
  from profiles p where p.user_id = them;
$$;

create or replace function set_share(p_share jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v jsonb := '{}'::jsonb;
  k text;
begin
  if auth.uid() is null then return; end if;
  foreach k in array array['now', 'bar', 'stats', 'days'] loop
    v := v || jsonb_build_object(k, case when p_share->>k in ('mutuals', 'followers', 'anyone') then p_share->>k else 'nobody' end);
  end loop;
  v := v || jsonb_build_object('map', case when p_share->>'map' = 'close' then 'close' else 'nobody' end);
  insert into profiles (user_id, share) values (auth.uid(), v)
    on conflict (user_id) do update set share = excluded.share, updated_at = now();
end $$;

-- ---------- Following ----------

-- Ask to follow: 'requested', 'following' (already), or 'not found'.
create or replace function follow(p_to uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return 'Sign in first.'; end if;
  if p_to = auth.uid() or social_blocked(auth.uid(), p_to) or not exists (select 1 from profiles where user_id = p_to) then return 'not found'; end if;
  if social_follows(auth.uid(), p_to) then return 'following'; end if;
  insert into follow_requests (from_id, to_id) values (auth.uid(), p_to) on conflict do nothing;
  return 'requested';
end $$;

-- Someone asked to follow you: yes or no.
create or replace function answer_request(p_from uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if not exists (select 1 from follow_requests where from_id = p_from and to_id = auth.uid()) then return; end if;
  delete from follow_requests where from_id = p_from and to_id = auth.uid();
  if p_accept and not social_blocked(auth.uid(), p_from) then
    insert into follows (follower_id, followee_id) values (p_from, auth.uid()) on conflict do nothing;
  end if;
end $$;

create or replace function cancel_request(p_to uuid) returns void
language sql security definer set search_path = public as $$
  delete from follow_requests where from_id = auth.uid() and to_id = p_to;
$$;

create or replace function unfollow(p_them uuid) returns void
language sql security definer set search_path = public as $$
  delete from follows where follower_id = auth.uid() and followee_id = p_them;
$$;

create or replace function remove_follower(p_them uuid) returns void
language sql security definer set search_path = public as $$
  delete from follows where follower_id = p_them and followee_id = auth.uid();
$$;

-- Put a follower on (or off) your close friends: they see your map, if you share it.
create or replace function set_close(p_them uuid, p_close boolean) returns void
language sql security definer set search_path = public as $$
  update follows set close = p_close where follower_id = p_them and followee_id = auth.uid();
$$;

-- Blocking ends following both ways and any requests, and you can't find each other.
create or replace function block_user(p_them uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_them = auth.uid() then return; end if;
  delete from follows where (follower_id = auth.uid() and followee_id = p_them) or (follower_id = p_them and followee_id = auth.uid());
  delete from follow_requests where (from_id = auth.uid() and to_id = p_them) or (from_id = p_them and to_id = auth.uid());
  insert into user_blocks (user_id, blocked_id) values (auth.uid(), p_them) on conflict do nothing;
end $$;

-- Everything for the Social tab.
create or replace function my_social() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'me', (select jsonb_build_object('id', user_id, 'username', username, 'name', name, 'avatar', avatar, 'share', share, 'now', social_now(user_id))
           from profiles where user_id = auth.uid()),
    'following', coalesce((select jsonb_agg(social_card(followee_id) || jsonb_build_object('now', social_now(followee_id)) order by since desc)
                           from follows where follower_id = auth.uid()), '[]'::jsonb),
    'followers', coalesce((select jsonb_agg(social_card(follower_id) order by since desc) from follows where followee_id = auth.uid()), '[]'::jsonb),
    'incoming', coalesce((select jsonb_agg(social_card(from_id) || jsonb_build_object('at', created_at) order by created_at desc) from follow_requests where to_id = auth.uid()), '[]'::jsonb),
    'outgoing', coalesce((select jsonb_agg(social_card(to_id) order by created_at desc) from follow_requests where from_id = auth.uid()), '[]'::jsonb),
    'blocked', coalesce((select jsonb_agg(jsonb_build_object('id', b.blocked_id, 'username', p.username, 'name', coalesce(nullif(p.name, ''), p.username), 'avatar', p.avatar))
                         from user_blocks b left join profiles p on p.user_id = b.blocked_id where b.user_id = auth.uid()), '[]'::jsonb),
    'pinned', coalesce((select jsonb_agg(day order by day desc) from shared_days where user_id = auth.uid()), '[]'::jsonb)
  );
$$;

-- The phone's check-in: follow requests waiting for you (it notifies once for each).
create or replace function incoming_requests() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(social_card(from_id) || jsonb_build_object('at', created_at) order by created_at), '[]'::jsonb)
  from follow_requests where to_id = auth.uid();
$$;

-- …and people who said yes to you lately, and your newest followers (it notifies once for each).
create or replace function recent_follows() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'accepted', coalesce((select jsonb_agg(social_card(followee_id) || jsonb_build_object('at', since) order by since)
                          from follows where follower_id = auth.uid() and since > now() - interval '3 days'), '[]'::jsonb),
    'followers', coalesce((select jsonb_agg(social_card(follower_id) || jsonb_build_object('at', since) order by since)
                           from follows where followee_id = auth.uid() and since > now() - interval '3 days'), '[]'::jsonb));
$$;

do $$
declare f text;
begin
  foreach f in array array['social_follows(uuid,uuid)', 'social_can_see(uuid,uuid,text)', 'social_card(uuid)', 'set_share(jsonb)',
                           'follow(uuid)', 'answer_request(uuid,boolean)', 'cancel_request(uuid)', 'unfollow(uuid)', 'remove_follower(uuid)',
                           'set_close(uuid,boolean)', 'block_user(uuid)', 'my_social()', 'incoming_requests()', 'recent_follows()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
