-- Minute by Minute: rebuild the day from your dots, every time it's looked at.
-- Run after 013, in the minute-by-minute project. Safe to run again.
--
-- The phone decides things in the moment (you've stopped, you've left), and sometimes it's wrong
-- or misses something. rebuild_day() goes back over all the dots for a stretch of time and fixes
-- the stops and Commutes to match what the dots show. It runs whenever the website or the phone
-- opens a day, and after the phone sends new dots. Running it again changes nothing.
--
--   1. Clean dots: rough ones (worse than ±65 m) and lone spikes (far off between two dots that
--      are close together) are ignored.
--   2. Stays: dots within ~75 m of each other for 5+ minutes (100 m+ apart = a different place) (a gap with no dots counts, until
--      shortly before the next dot somewhere else: as long as it takes to get there).
--   3. Stops are fixed to match each stay: one there already is stretched to cover it; stops
--      somewhere else at the same time are cut out of it (the dots say you weren't there); if
--      there's none, one is added.
--   4. Trips between stops get an automatic Commute (your own entries still win: see 013), and
--      whatever was running when you left ends then. Delete an automatic Commute and it stays
--      deleted (that trip is remembered and skipped).

alter table visits add column if not exists source text not null default 'phone'; -- phone | dots

-- Automatic entries you deleted: don't make them again.
create table if not exists dismissed (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  primary key (user_id, started_at)
);
alter table dismissed enable row level security;
drop policy if exists "own dismissed" on dismissed;
create policy "own dismissed" on dismissed for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- (The website adds a row here when you delete an automatic entry.)
drop trigger if exists blocks_remember_dismissed on blocks;
drop function if exists blocks_remember_dismissed();

-- One stay from the dots: s → e (e null: still there), around lat/lng, from n dots.
create or replace function apply_stay(p_s timestamptz, p_e timestamptz, p_lat double precision, p_lng double precision, p_n integer)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v visits%rowtype;
  o visits%rowtype;
  v_e timestamptz := coalesce(p_e, 'infinity');
  v_dep timestamptz;
  v_min constant interval := interval '3 minutes';
begin
  -- The stop for this stay: one within 75 m then, or within 150 m if it's about as long as the
  -- stay (the same stop, its pin just a bit off: the phone's spot vs. where the dots were).
  -- Stretch it to cover the stay (never into another stop).
  select * into v from visits
    where user_id = auth.uid() and arrived_at < v_e and coalesce(departed_at, 'infinity') > p_s
      and (meters_between(lat, lng, p_lat, p_lng) <= 75
           or (meters_between(lat, lng, p_lat, p_lng) <= 150
               and coalesce(departed_at, now()) - arrived_at <= (coalesce(p_e, now()) - p_s) * 1.5 + interval '10 minutes'))
    order by meters_between(lat, lng, p_lat, p_lng) limit 1;
  if v.id is not null then
    begin
      update visits w set
          arrived_at = least(w.arrived_at, p_s),
          departed_at = case when w.departed_at is null or p_e is null then w.departed_at else greatest(w.departed_at, p_e) end
        where w.id = v.id
          and not exists (
            select 1 from visits x where x.user_id = auth.uid() and x.id <> w.id
              and x.arrived_at < coalesce(case when w.departed_at is null or p_e is null then w.departed_at else greatest(w.departed_at, p_e) end, 'infinity')
              and coalesce(x.departed_at, 'infinity') > least(w.arrived_at, p_s)
          );
    exception when unique_violation then null;
    end;
  end if;

  -- One dot on its own isn't enough to overrule the stops.
  if p_n < 2 then return; end if;

  -- Stops somewhere else during the stay: you weren't there then. Keep the parts before / after.
  for o in
    select * from visits
    where user_id = auth.uid() and id is distinct from v.id and meters_between(lat, lng, p_lat, p_lng) > 75
      and arrived_at < v_e and coalesce(departed_at, 'infinity') > p_s
      -- (really overlapping: 2+ minutes, not just touching)
      and least(v_e, coalesce(departed_at, 'infinity')) - greatest(p_s, arrived_at) >= interval '2 minutes'
    order by arrived_at
  loop
    v_dep := coalesce(o.departed_at, 'infinity');
    if v_dep > v_e and (v_dep = 'infinity' or v_dep - v_e >= v_min) then
      insert into visits (arrived_at, departed_at, lat, lng, accuracy_m, place_id, auto_name, source)
        values (v_e, o.departed_at, o.lat, o.lng, o.accuracy_m, o.place_id, o.auto_name, o.source)
        on conflict (user_id, arrived_at) do nothing;
    end if;
    if p_s - o.arrived_at >= v_min then
      update visits set departed_at = p_s where id = o.id;
    else
      delete from visits where id = o.id;
    end if;
  end loop;

  -- No stop here: add one.
  if v.id is null then
    insert into visits (arrived_at, departed_at, lat, lng, place_id, source)
      values (p_s, p_e, p_lat, p_lng, place_at(p_lat, p_lng), 'dots')
      on conflict (user_id, arrived_at) do nothing;
  end if;
end $$;

-- When a stay starts and ends, from its dots in order (speed in m/s, null if unknown): it starts
-- when the walk in stops (the last moving dot at the start) and ends when the walk out starts
-- (the first moving dot at the end). dep null: no walk out among these dots.
create or replace function stay_bounds(p_at timestamptz[], p_speed double precision[], out arr timestamptz, out dep timestamptz)
language plpgsql
immutable
as $$
declare
  n integer := coalesce(array_length(p_at, 1), 0);
  i integer;
  j integer;
begin
  arr := p_at[1];
  dep := null;
  if n = 0 then return; end if;
  i := 1;
  while i <= n and p_speed[i] is not null and p_speed[i] >= 1.0 loop i := i + 1; end loop;
  if i > 1 and i <= n then arr := p_at[i - 1]; end if;
  j := n;
  while j >= 1 and p_speed[j] is not null and p_speed[j] >= 1.0 loop j := j - 1; end loop;
  if j < n and j >= 1 then dep := p_at[j + 1]; end if;
end $$;

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
begin
  if auth.uid() is null then return; end if;
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
      -- Somewhere else now. You left when the walk out started; if the dots don't show that,
      -- shortly before this dot (the time it takes to get here).
      b := stay_bounds(c_at, c_sp);
      v_end := coalesce(b.dep, greatest(c_at[c_n], r.at - make_interval(secs => meters_between(c_lat, c_lng, r.lat, r.lng) / greatest(coalesce(r.speed_mps, 1.4), 1.0))));
      if v_end - b.arr >= interval '5 minutes' then
        insert into _stays values (b.arr, v_end, c_lat, c_lng, c_n);
      end if;
    end if;
    c_lat := r.lat; c_lng := r.lng; c_n := 1; c_at := array[r.at]; c_sp := array[r.speed_mps];
  end loop;
  -- The last group: if it's recent, you're still there.
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
  -- ...and no stop runs into the trip between two stays somewhere else (you were on the way).
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

  -- 4: a Commute for each trip between two stops (somewhere else, within 3 hours).
  v_commute := activity_id_for('Commute');
  for a in
    with s as (
      select id, arrived_at, departed_at, lat, lng,
             lead(arrived_at) over w as next_at, lead(lat) over w as next_lat, lead(lng) over w as next_lng
      from visits where user_id = auth.uid() and arrived_at < p_to and coalesce(departed_at, 'infinity') > p_from - interval '3 hours'
      window w as (order by arrived_at)
    )
    select departed_at as left_at, next_at from s
    where departed_at is not null and next_at is not null
      and next_at - departed_at between interval '30 seconds' and interval '3 hours'
      and meters_between(lat, lng, next_lat, next_lng) > 100
  loop
    if exists (
      select 1 from blocks where user_id = auth.uid() and activity_id = v_commute
        and started_at < a.next_at and coalesce(ended_at, 'infinity') > a.left_at
    ) or exists (
      select 1 from dismissed where user_id = auth.uid() and started_at < a.next_at and ended_at > a.left_at
    ) then continue; end if;
    -- What was running when you left ends then (only things that began before).
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

-- The old name (the website called this before 014) does the full rebuild now.
create or replace function repair_day(p_from timestamptz, p_to timestamptz)
returns void
language sql
security invoker
set search_path = public
as $$ select rebuild_day(p_from, p_to) $$;
