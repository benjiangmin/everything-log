-- Minute by Minute: a stop the phone never said you left gets closed.
-- Run after 014, in the minute-by-minute project. Safe to run again.
--
-- If the phone misses that you left somewhere (tonight: Humes), the stop stays "open" even after
-- you've arrived somewhere else, so there's no trip home and no Commute. Now, every rebuild
-- closes an open stop that has a later one: at the last dot that still had you there. And two
-- stops in a row at the same place, minutes apart, become one.

-- (apply_stay again, as in 014 with a fix: comparing a stay you're still at with a stop that's
-- still open no longer fails.)
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
      and least(coalesce(p_e, now()), coalesce(departed_at, now())) - greatest(p_s, arrived_at) >= interval '2 minutes'
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

create or replace function close_open_stops(p_to timestamptz)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v record;
  n record;
  v_dep timestamptz;
  pv_id uuid;
  pv_dep timestamptz;
  pv_lat double precision;
  pv_lng double precision;
  pv_place uuid;
begin
  for v in select id, arrived_at, lat, lng from visits where user_id = auth.uid() and departed_at is null and arrived_at < p_to order by arrived_at loop
    select arrived_at, lat, lng into n from visits
      where user_id = auth.uid() and arrived_at > v.arrived_at order by arrived_at limit 1;
    if n.arrived_at is null then continue; end if;
    select max(at) into v_dep from points
      where user_id = auth.uid() and at > v.arrived_at and at < n.arrived_at
        and meters_between(lat, lng, v.lat, v.lng) <= 100;
    if v_dep is null then
      v_dep := n.arrived_at - make_interval(secs => meters_between(v.lat, v.lng, n.lat, n.lng) / 1.4);
    end if;
    v_dep := least(n.arrived_at, greatest(v_dep, v.arrived_at + interval '1 minute'));
    update visits set departed_at = v_dep where id = v.id;
  end loop;

  -- Two stops in a row at the same place, minutes apart, are one stop.
  pv_id := null;
  for v in select id, arrived_at, departed_at, lat, lng, place_id from visits where user_id = auth.uid() and arrived_at < p_to order by arrived_at loop
    if pv_id is not null and pv_dep is not null and v.arrived_at - pv_dep <= interval '10 minutes'
       and ((v.place_id is not null and v.place_id = pv_place) or meters_between(v.lat, v.lng, pv_lat, pv_lng) <= 75) then
      delete from visits where id = v.id;
      update visits set departed_at = v.departed_at where id = pv_id;
      pv_dep := v.departed_at;
      continue;
    end if;
    pv_id := v.id; pv_dep := v.departed_at; pv_lat := v.lat; pv_lng := v.lng; pv_place := v.place_id;
  end loop;
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

  -- 3b: a stop still "open" with another one after it: you left it. When the dots last had
  -- you there (or, with no dots, the time it takes to get to the next one).
  perform close_open_stops(p_to);

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

