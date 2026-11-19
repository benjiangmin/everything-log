-- Minute by Minute: categories, job settings, and plans that become entries.
--
-- Categories (Schooling: CS577, CS577 DIS, ENTOM...): every job in one is the category's color,
-- and inherits its settings (a job can set its own instead).
-- A job's settings:
--   stop_on_commute  leaving stops it (default yes). Off: it keeps going until you stop it.
--   places           its places. Commuting between them keeps it going (the Commute goes under it);
--                    arriving anywhere else stops it, from when you left the last of them.
--   auto_start       arriving at one of its places starts it.
--   weekly_goal_min  a goal for the week, on Stats (not inherited: a category has its own).
--   hide_from_stats  on the bar, left out of Stats.
-- Plans (calendar_events): one with a place starts when you get there, up to its end (arrive up
-- to 30 minutes early and it counts from then; earlier, from its start). Its job: the one with
-- its name, or a new one. One without a place is asked about on the site at its time.

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  color text not null default '#7f5539' check (color ~ '^#[0-9a-fA-F]{6}$'),
  stop_on_commute boolean,
  places uuid[],
  auto_start boolean,
  weekly_goal_min integer check (weekly_goal_min between 1 and 10080),
  hide_from_stats boolean,
  created_at timestamptz not null default now()
);
create unique index if not exists categories_name on categories (user_id, lower(btrim(name)));
alter table categories enable row level security;
drop policy if exists "own categories" on categories;
create policy "own categories" on categories to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table activities
  add column if not exists category_id uuid references categories(id) on delete set null,
  add column if not exists own_color text check (own_color ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists stop_on_commute boolean,
  add column if not exists places uuid[],
  add column if not exists auto_start boolean,
  add column if not exists weekly_goal_min integer check (weekly_goal_min between 1 and 10080),
  add column if not exists hide_from_stats boolean;

alter table calendar_events
  add column if not exists started_block uuid references blocks(id) on delete set null,
  add column if not exists skipped boolean not null default false;

-- What was started for you (so deleting it doesn't make it start again): 'visit:<id>:<job>'.
create table if not exists auto_starts (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null,
  at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table auto_starts enable row level security;
drop policy if exists "own auto_starts" on auto_starts;
create policy "own auto_starts" on auto_starts to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Colors: a job in a category is the category's color ----------
-- (Its own color is kept in own_color, and comes back if it leaves the category.)
create or replace function activities_category_color()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.category_id is not null then
    if tg_op = 'INSERT' or old.category_id is null then
      new.own_color := coalesce(new.own_color, new.color);
    elsif new.color is distinct from old.color
          and new.color is distinct from (select color from categories where id = new.category_id) then
      new.own_color := new.color; -- (you changed it while in one: that's its own color for later)
    end if;
    new.color := (select color from categories where id = new.category_id);
  elsif tg_op = 'UPDATE' and old.category_id is not null then
    new.color := coalesce(new.own_color, new.color);
    new.own_color := null;
  end if;
  return new;
end $$;
drop trigger if exists activities_category_color on activities;
create trigger activities_category_color before insert or update of category_id, color on activities
  for each row execute function activities_category_color();

create or replace function categories_color()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update activities set color = new.color where category_id = new.id and color is distinct from new.color;
  return null;
end $$;
drop trigger if exists categories_color on categories;
create trigger categories_color after update of color on categories
  for each row execute function categories_color();

-- ---------- A job's settings, with its category's filled in ----------
create or replace function job_prefs(p_activity uuid)
returns table (stop_on_commute boolean, places uuid[], auto_start boolean, hide_from_stats boolean)
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(a.stop_on_commute, c.stop_on_commute, true),
         coalesce(a.places, c.places, '{}'::uuid[]),
         coalesce(a.auto_start, c.auto_start, false),
         coalesce(a.hide_from_stats, c.hide_from_stats, false)
  from (select 1) one
  left join activities a on a.id = p_activity and a.user_id = auth.uid()
  left join categories c on c.id = a.category_id;
$$;

-- Keeps going through a commute: doesn't stop for commuting, or has its own places.
create or replace function keeps_commutes(p_activity uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select not jp.stop_on_commute or cardinality(jp.places) > 0 from job_prefs(p_activity) jp;
$$;

-- ---------- Commutes under a job that keeps going ----------
-- (As 013, except a job that keeps going through commutes doesn't push the Commute out: the two
-- overlap, and the Commute shows as a second row under it.)
create or replace function make_room_for_yours(p_from timestamptz, p_to timestamptz)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  m record;
  c record;
  v_min constant interval := interval '1 minute';
begin
  for m in
    select started_at, ended_at from blocks
    where user_id = auth.uid() and source <> 'location' and ended_at is not null
      and started_at < p_to and ended_at > p_from
      and not keeps_commutes(activity_id)
    order by started_at
  loop
    for c in
      select id, started_at, ended_at, activity_id, note, confirmed from blocks
      where user_id = auth.uid() and source = 'location'
        and started_at < m.ended_at and coalesce(ended_at, 'infinity') > m.started_at
    loop
      if c.started_at >= m.started_at and coalesce(c.ended_at, 'infinity') <= m.ended_at then
        delete from blocks where id = c.id;
      elsif c.started_at < m.started_at and coalesce(c.ended_at, 'infinity') > m.ended_at then
        update blocks set ended_at = m.started_at, updated_at = now() where id = c.id;
        insert into blocks (started_at, ended_at, activity_id, note, source, confirmed)
          values (m.ended_at, c.ended_at, c.activity_id, c.note, 'location', c.confirmed);
      elsif c.started_at < m.started_at then
        update blocks set ended_at = m.started_at, updated_at = now() where id = c.id;
      else
        update blocks set started_at = m.ended_at, updated_at = now() where id = c.id;
      end if;
    end loop;
  end loop;
  delete from blocks
    where user_id = auth.uid() and source = 'location' and ended_at is not null and ended_at - started_at < v_min
      and started_at < p_to and ended_at > p_from;
end $$;

-- ---------- Leaving: what stops, and what keeps going ----------
-- Run after each sync of stops.
create or replace function end_jobs_on_leaving()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  r record;
  nv record;
  v_left timestamptz;
begin
  -- A job with no places of its own (and that stops when commuting): as 027, it ends when you
  -- left the stop where you started it (once you've really gone).
  update blocks b set ended_at = v.departed_at, updated_at = now()
  from visits v
  where b.user_id = auth.uid() and v.user_id = auth.uid() and v.source = 'locokit'
    and v.departed_at is not null and v.departed_at > now() - interval '24 hours'
    and b.ended_at is null and b.source <> 'location'
    and b.started_at >= v.arrived_at - interval '2 minutes' and b.started_at < v.departed_at
    and exists (select 1 from job_prefs(b.activity_id) jp where jp.stop_on_commute and cardinality(jp.places) = 0)
    and exists (select 1 from points p where p.user_id = auth.uid() and p.source = 'locokit'
                and p.at > v.departed_at and p.at < v.departed_at + interval '20 minutes'
                and meters_between(p.lat, p.lng, v.lat, v.lng) > 150);

  -- A job with places: keeps going while you go between them; ends once you arrive somewhere
  -- else, from when you left the last stop before it.
  for r in
    select b.id, b.started_at, jp.places from blocks b cross join lateral job_prefs(b.activity_id) jp
    where b.user_id = auth.uid() and b.ended_at is null and b.source <> 'location'
      and b.started_at > now() - interval '24 hours'
      and jp.stop_on_commute and cardinality(jp.places) > 0
  loop
    select arrived_at into nv from visits
      where user_id = auth.uid() and arrived_at > r.started_at
        and (place_id is null or not (place_id = any (r.places)))
      order by arrived_at limit 1;
    if not found then continue; end if;
    select max(departed_at) into v_left from visits
      where user_id = auth.uid() and departed_at > r.started_at and departed_at <= nv.arrived_at;
    update blocks set ended_at = greatest(coalesce(v_left, nv.arrived_at), started_at + interval '1 minute'), updated_at = now()
      where id = r.id;
  end loop;
end $$;

-- ---------- Starting things for you ----------
create or replace function job_named(p_name text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v uuid;
begin
  select id into v from activities where user_id = auth.uid() and lower(btrim(name)) = lower(btrim(p_name));
  if v is null then
    insert into activities (name) values (left(btrim(p_name), 60)) on conflict do nothing returning id into v;
    if v is null then
      select id into v from activities where user_id = auth.uid() and lower(btrim(name)) = lower(btrim(p_name));
    end if;
  end if;
  return v;
end $$;

-- Where a plan is: its own spot, or one of your places its location names.
create or replace function plan_spot(p_lat double precision, p_lng double precision, p_location text)
returns table (lat double precision, lng double precision)
language sql
stable
security invoker
set search_path = public
as $$
  select p_lat, p_lng where p_lat is not null and p_lng is not null
  union all
  (select pl.lat, pl.lng from places pl
    where p_lat is null and p_location is not null and pl.user_id = auth.uid() and length(pl.name) >= 3
      and (lower(btrim(p_location)) = lower(pl.name) or lower(btrim(p_location)) like lower(pl.name) || '%'
           or lower(btrim(split_part(p_location, ',', 1))) = lower(pl.name))
    order by length(pl.name) desc limit 1);
$$;

-- Arriving at one of a job's places starts it (if it isn't going already). And plans you've got
-- to: they start. Run after each sync, and when the Day page opens.
create or replace function start_for_you()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  r record;
  v_block uuid;
  v_job uuid;
  v_start timestamptz;
begin
  if auth.uid() is null then return; end if;

  -- Its places.
  for r in
    select v.id as visit, v.arrived_at, a.id as job from visits v
    join activities a on a.user_id = auth.uid()
    cross join lateral job_prefs(a.id) jp
    where v.user_id = auth.uid() and v.arrived_at > now() - interval '24 hours' and v.place_id is not null
      and (v.departed_at is null or v.departed_at > v.arrived_at + interval '5 minutes')
      and jp.auto_start and v.place_id = any (jp.places)
      and not exists (select 1 from auto_starts s where s.user_id = auth.uid() and s.key = 'visit:' || v.id || ':' || a.id)
      and not exists (select 1 from blocks b where b.user_id = auth.uid() and b.activity_id = a.id
                      and b.started_at <= v.arrived_at + interval '5 minutes' and coalesce(b.ended_at, 'infinity') >= v.arrived_at)
    order by v.arrived_at
  loop
    insert into auto_starts (key) values ('visit:' || r.visit || ':' || r.job) on conflict do nothing;
    -- (Started a moment ago by an earlier stop in this same list: still going, so not again.)
    if exists (select 1 from blocks b where b.user_id = auth.uid() and b.activity_id = r.job
               and b.started_at <= r.arrived_at + interval '5 minutes' and coalesce(b.ended_at, 'infinity') >= r.arrived_at) then
      continue;
    end if;
    begin
      insert into blocks (started_at, ended_at, activity_id, source) values (r.arrived_at, null, r.job, 'manual');
    exception when check_violation then null;
    end;
  end loop;

  -- Plans with a place: when you got there (up to 30 minutes early counts; earlier, its start),
  -- if that's before its end and not in the future.
  for r in
    select e.id, e.title, e.starts_at, e.ends_at, v.arrived_at from calendar_events e
    cross join lateral plan_spot(e.lat, e.lng, e.location) s
    join lateral (
      select vv.arrived_at from visits vv
      where vv.user_id = auth.uid() and vv.arrived_at < e.ends_at
        and coalesce(vv.departed_at, 'infinity') > greatest(e.starts_at - interval '30 minutes', vv.arrived_at)
        and meters_between(vv.lat, vv.lng, s.lat, s.lng) <= 120
      order by vv.arrived_at desc limit 1
    ) v on true
    where e.user_id = auth.uid() and not e.all_day and not e.skipped and e.started_block is null
      and e.ends_at > now() - interval '24 hours' and e.ends_at - e.starts_at <= interval '16 hours'
      and length(btrim(e.title)) >= 1
  loop
    v_start := case when r.arrived_at >= r.starts_at - interval '30 minutes' then r.arrived_at else r.starts_at end;
    if v_start > now() or v_start >= r.ends_at then continue; end if;
    v_job := job_named(r.title);
    -- (Already going, e.g. it started itself at its place: that's the one.)
    select id into v_block from blocks where user_id = auth.uid() and activity_id = v_job
      and started_at <= v_start + interval '10 minutes' and coalesce(ended_at, 'infinity') > v_start limit 1;
    if v_block is null then
      begin
        insert into blocks (started_at, ended_at, activity_id, source) values (v_start, null, v_job, 'calendar') returning id into v_block;
      exception when check_violation then continue;
      end;
    end if;
    update calendar_events set started_block = v_block where user_id = auth.uid() and id = r.id;
  end loop;

  perform end_jobs_on_leaving();
end $$;

-- A plan with no place, at its time: Start (now), or Skip.
create or replace function answer_plan(p_id text, p_start boolean)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  e record;
  v_block uuid;
begin
  select * into e from calendar_events where user_id = auth.uid() and id = p_id;
  if not found or e.started_block is not null then return e.started_block; end if;
  if not p_start then
    update calendar_events set skipped = true where user_id = auth.uid() and id = p_id;
    return null;
  end if;
  insert into blocks (started_at, ended_at, activity_id, source) values (now(), null, job_named(e.title), 'calendar') returning id into v_block;
  update calendar_events set started_block = v_block where user_id = auth.uid() and id = p_id;
  return v_block;
end $$;

-- ---------- The phone's stops (as 042, then 043's starting and stopping) ----------
create or replace function sync_locokit_visits(p_from timestamptz, p_visits jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  x record;
  v_id uuid;
  v_place uuid;
  v_pinned boolean;
  v_outline jsonb;
  v_edge timestamptz;
  v_was uuid;
  v_keep boolean;
  ft record;
begin
  if auth.uid() is null then return; end if;

  -- One stop the phone split in two: back to one, from the first one's arrival (the joined stop
  -- keeps the later one's id and spot). Split when you moved a bit inside (a 10-second "trip"),
  -- or when the phone stopped recording for hours and started a new stop on waking up.
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'arrived', arrived, 'departed', departed, 'lat', lat, 'lng', lng, 'radius', radius) order by arrived), '[]')
    into p_visits
  from (
    select (array_agg(id order by arrived desc))[1] as id, min(arrived) as arrived,
           (array_agg(departed order by arrived desc))[1] as departed,
           -- Its spot: the piece inside one of your places' buildings, else the longest one (not
           -- the latest: a short piece on waking up can be across the street).
           (array_agg(lat order by (bid is not null) desc, coalesce(departed, now()) - arrived desc))[1] as lat,
           (array_agg(lng order by (bid is not null) desc, coalesce(departed, now()) - arrived desc))[1] as lng,
           (array_agg(radius order by arrived desc))[1] as radius
    from (
      -- (Joined when: less than 3 minutes apart, and either within 60 m, or both inside the same
      -- building of one of your places, however big. A place's 100 m radius isn't enough.)
      select *, sum(case when pdep is null
                          or (meters_between(lat, lng, plat, plng) > 60 and (bid is null or bid is distinct from pbid))
                          -- Apart for a while: a new stop only if the dots show you went somewhere
                          -- in between (150 m+ away). None (the phone stopped recording while it
                          -- sat still, e.g. overnight) or only wobble: you never left. Up to 16 h.
                          or (arrived - pdep > interval '3 minutes'
                              and (arrived - pdep > interval '16 hours'
                                   or exists (select 1 from points p where p.user_id = auth.uid() and p.source = 'locokit'
                                              and p.at > pdep and p.at < arrived
                                              and meters_between(p.lat, p.lng, plat, plng) > 150))) then 1 else 0 end)
                  over (order by arrived) as grp
      from (
        select s0.*, lag(departed) over w as pdep, lag(lat) over w as plat, lag(lng) over w as plng, lag(bid) over w as pbid
        from (
          select left(e->>'id', 64) as id, (e->>'arrived')::timestamptz as arrived, (e->>'departed')::timestamptz as departed,
                 (e->>'lat')::float8 as lat, (e->>'lng')::float8 as lng, (e->>'radius')::float8 as radius,
                 building_place((e->>'lat')::float8, (e->>'lng')::float8, greatest(15, least(40, coalesce((e->>'radius')::float8, 20)))) as bid
          from jsonb_array_elements(coalesce(p_visits, '[]')) e
          where e->>'id' is not null and e->>'lat' is not null and e->>'lng' is not null and e->>'arrived' is not null
            and not exists (select 1 from lk_removed r where r.user_id = auth.uid() and r.lk_id = e->>'id')
        ) s0
        window w as (order by arrived)
      ) s
    ) g
    group by grp
  ) m;

  delete from visits v
    where v.user_id = auth.uid() and v.source = 'locokit' and coalesce(v.departed_at, 'infinity') > p_from
      and not exists (select 1 from jsonb_array_elements(coalesce(p_visits, '[]')) e where e->>'id' = v.lk_id);

  for x in
    select left(e->>'id', 64) as id, (e->>'arrived')::timestamptz as arrived, (e->>'departed')::timestamptz as departed,
           (e->>'lat')::float8 as lat, (e->>'lng')::float8 as lng, (e->>'radius')::float8 as radius
    from jsonb_array_elements(coalesce(p_visits, '[]')) e
    where e->>'id' is not null and e->>'lat' is not null and e->>'lng' is not null
      and not exists (select 1 from lk_removed r where r.user_id = auth.uid() and r.lk_id = e->>'id')
    order by 2
  loop
    if x.departed is not null and x.departed < x.arrived then continue; end if;
    -- Waiting on your way, not a stop: somewhere that isn't one of your places (a bus stop, a
    -- crossing, outside a building), and either
    --   - you got on something right there (within 3 minutes of leaving, the dots go 6 m/s+, ~13
    --     mph, a bus or a car, starting within 100 m of where you stood), and it was under 45
    --     minutes (a class, then a walk to the bus, isn't this: the ride starts further away); or
    --   - it was only a few minutes (under 8).
    -- The trips either side join up into one Commute. (Kept if it's at one of your places, or you
    -- moved the stop yourself.)
    if x.departed is not null
       and (x.departed - x.arrived < interval '8 minutes'
            or (x.departed - x.arrived < interval '45 minutes'
                and exists (select 1 from points p where p.user_id = auth.uid() and p.source = 'locokit'
                            and p.at > x.departed and p.at < x.departed + interval '3 minutes' and p.speed_mps >= 6
                            and meters_between(p.lat, p.lng, x.lat, x.lng) <= 100)))
       and building_place(x.lat, x.lng, 10) is null
       and not exists (select 1 from places pl where pl.user_id = auth.uid() and pl.outline is null and meters_between(pl.lat, pl.lng, x.lat, x.lng) <= 35)
       and not exists (select 1 from visits vv where vv.user_id = auth.uid() and vv.lk_id = x.id and vv.pinned) then
      delete from visits where user_id = auth.uid() and lk_id = x.id;
      continue;
    end if;
    select id, place_id, pinned, outline into v_id, v_place, v_pinned, v_outline from visits where user_id = auth.uid() and lk_id = x.id;
    v_was := v_place;
    v_keep := false;
    -- A long stay (2 hours+) somewhere it was already one of your places keeps it while the
    -- phone's spot wobbles within 60 m of the building (overnight it drifts, e.g. across the
    -- alley), unless the spot is now at another of your places. That includes a stop that lost
    -- its place that way before this fix (its building's outline was kept): it gets it back.
    -- (And a new long stay just outside one of your places' buildings, with no place of its own:
    -- that place, the nearest.)
    if v_place is null and not coalesce(v_pinned, false) then
      select id into v_place from places where user_id = auth.uid() and v_outline is not null and outline = v_outline limit 1;
      if v_place is null and place_for_stop(x.lat, x.lng, x.radius) is null then
        select id into v_place from places pl where pl.user_id = auth.uid() and pl.outline is not null
          and near_outline(pl.outline, x.lat, x.lng, 60) order by meters_between(pl.lat, pl.lng, x.lat, x.lng) limit 1;
      end if;
    end if;
    if v_place is not null and not coalesce(v_pinned, false)
       and coalesce(x.departed, now()) - x.arrived >= interval '2 hours'
       and exists (select 1 from places pl where pl.id = v_place and pl.outline is not null
                   and near_outline(pl.outline, x.lat, x.lng, 60))
       and coalesce(place_for_stop(x.lat, x.lng, x.radius), v_place) = v_place then
      v_keep := true;
    elsif v_place is distinct from v_was then
      v_place := v_was;
    end if;
    -- Its place: kept only while it's still close enough (a place given by the old, looser
    -- rule to a stop next door, like Theory for Estacion Inka, is worked out again), unless you
    -- moved the stop yourself.
    if v_place is not null and not coalesce(v_pinned, false) and not v_keep
       and not at_place(v_place, x.lat, x.lng, x.radius) then
      v_place := null;
    end if;
    v_outline := coalesce(v_outline, (select outline from places where id = coalesce(v_place, place_for_stop(x.lat, x.lng, x.radius))));

    if v_outline is not null then
      -- In a building: when you walked in and out of it.
      ft := outline_times(v_outline, x.arrived, x.departed);
      x.arrived := ft.arr;
      x.departed := ft.dep;
    else
      -- Otherwise (as in 019): when the route dots stopped moving close by, and last were still.
      select min(p.at) into v_edge from points p
        where p.user_id = auth.uid() and p.source = 'locokit' and p.at < x.arrived and p.at > x.arrived - interval '15 minutes'
          and meters_between(p.lat, p.lng, x.lat, x.lng) <= 70 and coalesce(p.speed_mps, 0) <= 0.8
          and not exists (select 1 from points q where q.user_id = auth.uid() and q.source = 'locokit'
            and q.at > p.at and q.at < x.arrived and (meters_between(q.lat, q.lng, x.lat, x.lng) > 70 or coalesce(q.speed_mps, 0) > 0.8));
      if v_edge is not null and v_edge < x.arrived - interval '20 seconds' then x.arrived := v_edge; end if;
      if x.departed is not null then
        select max(p.at) into v_edge from points p
          where p.user_id = auth.uid() and p.source = 'locokit' and p.at > x.departed and p.at < x.departed + interval '15 minutes'
            and meters_between(p.lat, p.lng, x.lat, x.lng) <= 70 and coalesce(p.speed_mps, 0) <= 0.8
            and not exists (select 1 from points q where q.user_id = auth.uid() and q.source = 'locokit'
              and q.at < p.at and q.at > x.departed and (meters_between(q.lat, q.lng, x.lat, x.lng) > 70 or coalesce(q.speed_mps, 0) > 0.8));
        if v_edge is not null and v_edge > x.departed + interval '20 seconds' then x.departed := v_edge; end if;
      end if;
    end if;

    begin
      if v_id is null then
        insert into visits (arrived_at, departed_at, lat, lng, accuracy_m, place_id, source, lk_id, outline, outline_checked)
          values (x.arrived, x.departed,
                  case when v_keep then (select lat from places where id = v_place) else x.lat end,
                  case when v_keep then (select lng from places where id = v_place) else x.lng end,
                  x.radius, case when v_keep then v_place else place_for_stop(x.lat, x.lng, x.radius) end, 'locokit', x.id, v_outline, v_outline is not null);
      else
        -- Its times always follow the phone. Its spot too, unless you moved it or it's a named place.
        update visits set arrived_at = x.arrived, departed_at = x.departed, accuracy_m = x.radius,
            -- (Got its place back: back on the place's spot.)
            lat = case when v_pinned then lat when v_place is not null and v_was is null then (select lat from places where id = v_place)
                       when v_place is not null then lat else x.lat end,
            lng = case when v_pinned then lng when v_place is not null and v_was is null then (select lng from places where id = v_place)
                       when v_place is not null then lng else x.lng end,
            place_id = coalesce(v_place, place_for_stop(x.lat, x.lng, x.radius)),
            outline = v_outline,
            outline_checked = outline_checked or v_outline is not null
          where id = v_id;
      end if;
    exception when unique_violation or check_violation then
      null; -- another stop starts at the very same moment, or a bad one: skip it, send the rest
    end;
  end loop;

  -- What starts for you here, and what you leaving stops (043).
  perform start_for_you();
end $$;
