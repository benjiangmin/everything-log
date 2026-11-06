-- Minute by Minute: stops and routes from LocoKit (the engine behind the Arc Timeline app).
-- Run after 015, in the minute-by-minute project. Safe to run again.
--
-- The phone now uses LocoKit to work out where you stopped and how you got there. It keeps its
-- own timeline on the phone and keeps fixing it as it learns more (two stops that were really
-- one get merged, a stop's start moves back a few minutes...). So the phone sends its whole
-- recent timeline each time, and the database matches it:
--   - stops: one row per LocoKit stop (visits.lk_id). Gone from the phone = gone here.
--   - route dots: the dots on trips (points.source = 'locokit'), replaced a stretch at a time.
-- From the first LocoKit stop on, rebuild_day() stops working out stops from the dots itself
-- (LocoKit's are better) and only does the Commutes between them. Days before that are as they
-- were.

alter table visits add column if not exists lk_id text;
create unique index if not exists visits_lk on visits (user_id, lk_id) where lk_id is not null;
alter table visits add column if not exists pinned boolean not null default false; -- you moved it on the map
alter table points add column if not exists source text not null default 'phone'; -- phone | locokit

-- Stops you removed on the website, so the phone doesn't send them back.
create table if not exists lk_removed (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  lk_id text not null,
  primary key (user_id, lk_id)
);
alter table lk_removed enable row level security;
drop policy if exists "own lk_removed" on lk_removed;
create policy "own lk_removed" on lk_removed for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The phone's stops since p_from: [{id, arrived, departed (null: still there), lat, lng, radius}].
-- Every LocoKit stop since then that isn't in the list is gone.
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
begin
  if auth.uid() is null then return; end if;
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
    select id, place_id, pinned into v_id, v_place, v_pinned from visits where user_id = auth.uid() and lk_id = x.id;
    begin
      if v_id is null then
        insert into visits (arrived_at, departed_at, lat, lng, accuracy_m, place_id, source, lk_id)
          values (x.arrived, x.departed, x.lat, x.lng, x.radius, place_at(x.lat, x.lng), 'locokit', x.id);
      else
        -- Its times always follow the phone. Its spot too, unless you moved it or it's a named place.
        update visits set arrived_at = x.arrived, departed_at = x.departed, accuracy_m = x.radius,
            lat = case when v_pinned or v_place is not null then lat else x.lat end,
            lng = case when v_pinned or v_place is not null then lng else x.lng end,
            place_id = coalesce(v_place, place_at(x.lat, x.lng))
          where id = v_id;
      end if;
    exception when unique_violation or check_violation then
      null; -- another stop starts at the very same moment, or a bad one: skip it, send the rest
    end;
  end loop;
end $$;

-- The route dots between p_from and p_to: the phone's dots replace whatever LocoKit dots were
-- there (a dot that turned out to be at a stop isn't sent again, so it goes).
-- [{at, lat, lng, acc, speed, motion}]
create or replace function sync_locokit_points(p_from timestamptz, p_to timestamptz, p_points jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  delete from points p
    where p.user_id = auth.uid() and p.source = 'locokit' and p.at >= p_from and p.at <= p_to
      and not exists (select 1 from jsonb_array_elements(coalesce(p_points, '[]')) e where (e->>'at')::timestamptz = p.at);
  insert into points (at, lat, lng, accuracy_m, speed_mps, motion, source)
    select (e->>'at')::timestamptz, (e->>'lat')::float8, (e->>'lng')::float8,
           (e->>'acc')::float8, (e->>'speed')::float8, nullif(left(e->>'motion', 20), ''), 'locokit'
    from jsonb_array_elements(coalesce(p_points, '[]')) e
    where e->>'at' is not null and e->>'lat' is not null and e->>'lng' is not null
  on conflict (user_id, at) do update
    set lat = excluded.lat, lng = excluded.lng, accuracy_m = excluded.accuracy_m,
        speed_mps = excluded.speed_mps, motion = excluded.motion, source = 'locokit';
end $$;

-- As in 015, plus: from the first LocoKit stop on, its stops are used as they are (steps 1–3b
-- are skipped), and a Commute that's in pieces (a stop in the middle that LocoKit later took
-- back) joins up again.
create or replace function rebuild_day(p_from timestamptz, p_to timestamptz)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  r record;
  c_lat double precision;
  c_lng double precision;
  c_n integer := 0;
  c_at timestamptz[];
  c_sp double precision[];
  b record;
  v_end timestamptz;
  v_commute uuid;
  a record;
  st record;
  have_prev boolean := false;
  pv_e timestamptz;
  pv_lat double precision;
  pv_lng double precision;
  pv_n integer;
  v_lk_since timestamptz;
  v_pieces integer;
begin
  if auth.uid() is null then return; end if;
  select min(arrived_at) into v_lk_since from visits where user_id = auth.uid() and source = 'locokit';

  if v_lk_since is not null and p_to > v_lk_since then
    -- LocoKit days. An older stop still "open" from before LocoKit: you left it when the next one began.
    update visits v set departed_at = greatest(v.arrived_at, (
        select min(n.arrived_at) from visits n where n.user_id = auth.uid() and n.arrived_at > v.arrived_at))
      where v.user_id = auth.uid() and v.source <> 'locokit' and v.departed_at is null
        and exists (select 1 from visits n where n.user_id = auth.uid() and n.arrived_at > v.arrived_at);
  else
  create temp table if not exists _stays (s timestamptz, e timestamptz, lat double precision, lng double precision, n integer) on commit drop;
  truncate _stays;

  -- 1–2: walk the clean dots in order, grouping them into stays.
  for r in
    with d as (
      select at, lat, lng, speed_mps,
             lag(lat) over w as plat, lag(lng) over w as plng, lead(lat) over w as nlat, lead(lng) over w as nlng
      from points
      where user_id = auth.uid() and at >= p_from - interval '3 hours' and at < p_to
        and (accuracy_m is null or accuracy_m <= 65)
      window w as (order by at)
    )
    select at, lat, lng, speed_mps from d
    where not (plat is not null and nlat is not null
               and meters_between(plat, plng, lat, lng) > 150 and meters_between(lat, lng, nlat, nlng) > 150
               and meters_between(plat, plng, nlat, nlng) < 100)
    order by at
  loop
    if c_n > 0 and meters_between(r.lat, r.lng, c_lat, c_lng) <= 75 then
      c_lat := (c_lat * c_n + r.lat) / (c_n + 1);
      c_lng := (c_lng * c_n + r.lng) / (c_n + 1);
      c_n := c_n + 1;
      c_at := c_at || r.at;
      c_sp := c_sp || r.speed_mps;
      continue;
    end if;
    if c_n > 0 then
      b := stay_bounds(c_at, c_sp);
      v_end := coalesce(b.dep, greatest(c_at[c_n], r.at - make_interval(secs => meters_between(c_lat, c_lng, r.lat, r.lng) / greatest(coalesce(r.speed_mps, 1.4), 1.0))));
      if v_end - b.arr >= interval '5 minutes' then
        insert into _stays values (b.arr, v_end, c_lat, c_lng, c_n);
      end if;
    end if;
    c_lat := r.lat; c_lng := r.lng; c_n := 1; c_at := array[r.at]; c_sp := array[r.speed_mps];
  end loop;
  if c_n > 0 then
    b := stay_bounds(c_at, c_sp);
    if now() - c_at[c_n] < interval '2 hours' and b.dep is null and least(now(), p_to) - b.arr >= interval '5 minutes' then
      insert into _stays values (b.arr, null, c_lat, c_lng, c_n);
    elsif coalesce(b.dep, c_at[c_n]) - b.arr >= interval '5 minutes' then
      insert into _stays values (b.arr, coalesce(b.dep, c_at[c_n]), c_lat, c_lng, c_n);
    end if;
  end if;

  -- 3: the stops, fixed to match each stay.
  for st in select * from _stays order by s loop
    perform apply_stay(st.s, st.e, st.lat, st.lng, st.n);
  end loop;
  for st in select * from _stays order by s loop
    if have_prev and pv_e is not null and st.s > pv_e and st.n >= 2 and pv_n >= 2
       and meters_between(pv_lat, pv_lng, st.lat, st.lng) > 100 then
      update visits set departed_at = pv_e
        where user_id = auth.uid() and meters_between(lat, lng, pv_lat, pv_lng) <= 150
          and departed_at > pv_e and departed_at <= st.s and arrived_at < pv_e;
      begin
        update visits set arrived_at = st.s
          where user_id = auth.uid() and meters_between(lat, lng, st.lat, st.lng) <= 150
            and arrived_at >= pv_e and arrived_at < st.s and coalesce(departed_at, 'infinity') > st.s;
      exception when unique_violation then null;
      end;
    end if;
    have_prev := true;
    pv_e := st.e; pv_lat := st.lat; pv_lng := st.lng; pv_n := st.n;
  end loop;

  -- 3b
  perform close_open_stops(p_to);
  end if;

  -- 4: a Commute for each trip between two stops (somewhere else, within 3 hours).
  v_commute := activity_id_for('Commute');
  for a in
    with s as (
      select id, arrived_at, departed_at, lat, lng, source,
             lead(arrived_at) over w as next_at, lead(lat) over w as next_lat, lead(lng) over w as next_lng,
             lead(source) over w as next_source
      from visits where user_id = auth.uid() and arrived_at < p_to and coalesce(departed_at, 'infinity') > p_from - interval '3 hours'
      window w as (order by arrived_at)
    )
    select departed_at as left_at, next_at, source = 'locokit' and next_source = 'locokit' as lk from s
    where departed_at is not null and next_at is not null
      and next_at - departed_at between interval '30 seconds' and interval '3 hours'
      and meters_between(lat, lng, next_lat, next_lng) > 100
  loop
    if exists (select 1 from dismissed where user_id = auth.uid() and started_at < a.next_at and ended_at > a.left_at) then
      continue;
    end if;
    -- LocoKit: a trip whose Commute got cut in pieces (by a stop LocoKit has since taken back) is
    -- one Commute again. Only automatic pieces, and only if there's nothing of yours in between.
    if a.lk then
      select count(*) into v_pieces from blocks
        where user_id = auth.uid() and activity_id = v_commute and source = 'location'
          and started_at < a.next_at and coalesce(ended_at, 'infinity') > a.left_at;
      if v_pieces >= 2 and not exists (
        select 1 from blocks where user_id = auth.uid() and started_at < a.next_at and coalesce(ended_at, 'infinity') > a.left_at
          and (activity_id is distinct from v_commute or source <> 'location')
      ) then
        delete from blocks where user_id = auth.uid() and activity_id = v_commute and source = 'location'
          and started_at < a.next_at and coalesce(ended_at, 'infinity') > a.left_at;
      end if;
    end if;
    if exists (
      select 1 from blocks where user_id = auth.uid() and activity_id = v_commute
        and started_at < a.next_at and coalesce(ended_at, 'infinity') > a.left_at
    ) then continue; end if;
    update blocks set ended_at = a.left_at, updated_at = now()
      where user_id = auth.uid() and ended_at is null and started_at < a.left_at and activity_id is distinct from v_commute;
    insert into blocks (started_at, ended_at, activity_id, source, confirmed)
      values (a.left_at, a.next_at, v_commute, 'location', true);
  end loop;

  -- No automatic Commute runs through a stop.
  for a in
    select arrived_at, departed_at from visits
    where user_id = auth.uid() and departed_at is not null and arrived_at < p_to and departed_at > p_from - interval '3 hours'
  loop
    perform split_commute_at_stop(a.arrived_at, a.departed_at);
  end loop;
end $$;
