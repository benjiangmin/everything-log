-- Minute by Minute: stays the phone's dots show, even when iOS got them wrong.
-- Run after 011, in the minute-by-minute project. Safe to run again.
--
-- From today's data: iOS said you were at Bakke for 40 seconds (15:06:18–15:06:58), so the
-- Commute ran on for the whole gym visit. But the dots say otherwise: the last dot at Bakke was
-- at 15:07 (standing still), the next one was at 16:11, already ~650 m away at bus speed. So:
--
--   repair_day() now also looks for that inside an automatic Commute: no dots for 10+ minutes
--   after one where you were standing still. That's a stay: from that dot until shortly before
--   the next one (worked back from how far away it was and how fast you were going). The stop
--   there is stretched to match (or added), and the Commute is split around it.
--
--   Linking two stops with a Commute only trusts dots near the switch (±20 min), and at least two
--   of them (one stray dot at 10:07 made it look like you left home then).
--
--   Setting a place on an entry now also stretches a too-short stop there to cover the entry
--   (iOS had you at Morgridge for 2 minutes of a 79-minute class).

create or replace function repair_day(p_from timestamptz, p_to timestamptz)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v record;
  g record;
  v_end timestamptz;
  v_stop uuid;
  v_arrived timestamptz;
begin
  if auth.uid() is null then return; end if;

  -- 1) Stays hidden inside an automatic Commute (a long gap in the dots, after standing still).
  for g in
    with c as (
      select b.started_at, coalesce(b.ended_at, now()) as ended_at from blocks b
      where b.user_id = auth.uid() and b.source = 'location' and b.activity_id = activity_id_for('Commute')
        and b.started_at < p_to and coalesce(b.ended_at, now()) > p_from
    ),
    d as (
      select p.at, p.lat, p.lng, p.speed_mps,
             lead(p.at) over w as next_at, lead(p.lat) over w as next_lat, lead(p.lng) over w as next_lng,
             lead(p.speed_mps) over w as next_speed
      from points p where p.user_id = auth.uid() and p.at >= p_from - interval '1 day' and p.at < p_to
      window w as (order by p.at)
    )
    select distinct d.* from d join c on d.at >= c.started_at and d.next_at <= c.ended_at
    where d.next_at - d.at >= interval '10 minutes' and (d.speed_mps is null or d.speed_mps < 1.5)
    order by d.at
  loop
    -- Left shortly before the next dot: as long as it takes to get there at that speed.
    v_end := g.next_at - make_interval(secs => meters_between(g.lat, g.lng, g.next_lat, g.next_lng) / greatest(coalesce(g.next_speed, 1.4), 1.0));
    if v_end - g.at < interval '5 minutes' then continue; end if;
    v_stop := null;
    select id, arrived_at into v_stop, v_arrived from visits
      where user_id = auth.uid() and meters_between(lat, lng, g.lat, g.lng) < 150
        and arrived_at between g.at - interval '30 minutes' and g.at + interval '1 minute'
      order by arrived_at desc limit 1;
    if v_stop is not null then
      update visits set departed_at = v_end where id = v_stop and departed_at is not null and departed_at < v_end;
    else
      v_arrived := g.at;
      insert into visits (arrived_at, departed_at, lat, lng, place_id)
        values (g.at, v_end, g.lat, g.lng, place_at(g.lat, g.lng))
        on conflict (user_id, arrived_at) do nothing;
    end if;
  end loop;

  -- 2) No automatic Commute runs through a stop.
  for v in
    select arrived_at, departed_at from visits
    where user_id = auth.uid() and departed_at is not null and arrived_at < p_to and departed_at > p_from
    order by arrived_at
  loop
    perform split_commute_at_stop(v.arrived_at, v.departed_at);
  end loop;
end $$;

create or replace function set_entry_place(p_block_id uuid, p_place_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  b blocks%rowtype;
  p places%rowtype;
  v visits%rowtype;
  v_s timestamptz;
  v_e timestamptz;   -- end of the overlap ('infinity' = still going)
  v_dep timestamptz; -- the stop's own end ('infinity' = still there)
  v_bend timestamptz;
  v_min constant interval := interval '10 minutes'; -- shorter leftovers aren't real stops
  v_here uuid;
  v_sliver timestamptz;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into b from blocks where id = p_block_id and user_id = auth.uid();
  if b.id is null then raise exception 'That entry is gone'; end if;
  update blocks set place_id = p_place_id, updated_at = now() where id = b.id;
  if p_place_id is null then return; end if;
  select * into p from places where id = p_place_id and user_id = auth.uid();
  if p.id is null then raise exception 'That place is gone'; end if;
  v_bend := coalesce(b.ended_at, 'infinity');

  for v in
    select * from visits
    where user_id = auth.uid() and arrived_at < v_bend and coalesce(departed_at, 'infinity') > b.started_at
      and place_id is distinct from p.id
    order by arrived_at
  loop
    v_s := greatest(v.arrived_at, b.started_at);
    v_dep := coalesce(v.departed_at, 'infinity');
    v_e := least(v_dep, v_bend);
    if v_s - v.arrived_at > v_min then
      -- Before: the stop keeps its start and place, ending when the entry began.
      update visits set departed_at = v_s where id = v.id;
      insert into visits (arrived_at, departed_at, lat, lng, place_id)
        values (v_s, nullif(v_e, 'infinity'), p.lat, p.lng, p.id)
        on conflict (user_id, arrived_at) do nothing;
    else
      -- It starts with the entry: this stop becomes the "during" part.
      update visits set departed_at = nullif(v_e, 'infinity'), lat = p.lat, lng = p.lng, place_id = p.id, auto_name = null
        where id = v.id;
    end if;
    if v_dep > v_e and (v_dep = 'infinity' or v_dep - v_e > v_min) then
      -- After: back where the phone said, until it said you left.
      insert into visits (arrived_at, departed_at, lat, lng, accuracy_m, place_id, auto_name)
        values (v_e, nullif(v_dep, 'infinity'), v.lat, v.lng, v.accuracy_m, v.place_id, v.auto_name)
        on conflict (user_id, arrived_at) do nothing;
    end if;
  end loop;

  -- A leftover sliver somewhere else right before/after (from an earlier split): fold it in.
  select id into v_here from visits
    where user_id = auth.uid() and place_id = p.id and arrived_at < v_bend and coalesce(departed_at, 'infinity') > b.started_at
    order by arrived_at limit 1;
  if v_here is not null then
    with gone as (
      delete from visits
        where user_id = auth.uid() and place_id is distinct from p.id and departed_at is not null
          and departed_at between b.started_at - interval '1 minute' and b.started_at + interval '1 minute'
          and departed_at - arrived_at < v_min
        returning arrived_at
    )
    select min(arrived_at) into v_sliver from gone;
    if v_sliver is not null then
      update visits set arrived_at = least(arrived_at, v_sliver) where id = v_here;
    end if;
  end if;

  -- A stop there that's shorter than the entry (the phone only caught part of it): stretch it to
  -- cover the entry, as long as that doesn't run into another stop.
  if v_here is not null then
    begin
      update visits w set
          arrived_at = least(w.arrived_at, b.started_at),
          departed_at = case when w.departed_at is null or b.ended_at is null then w.departed_at else greatest(w.departed_at, b.ended_at) end
        where w.id = v_here
          and not exists (
            select 1 from visits o
            where o.user_id = auth.uid() and o.id <> w.id
              and o.arrived_at < coalesce(case when w.departed_at is null or b.ended_at is null then w.departed_at else greatest(w.departed_at, b.ended_at) end, 'infinity')
              and coalesce(o.departed_at, 'infinity') > least(w.arrived_at, b.started_at)
          );
    exception when unique_violation then null;
    end;
  end if;

  -- No stop there at all (the phone missed it): add one for the entry's time.
  if not exists (
    select 1 from visits where user_id = auth.uid() and place_id = p.id
      and arrived_at < v_bend and coalesce(departed_at, 'infinity') > b.started_at
  ) then
    insert into visits (arrived_at, departed_at, lat, lng, place_id)
      values (b.started_at, b.ended_at, p.lat, p.lng, p.id)
      on conflict (user_id, arrived_at) do update set lat = excluded.lat, lng = excluded.lng, place_id = excluded.place_id,
        departed_at = excluded.departed_at, auto_name = null;
  end if;
end $$;



create or replace function link_stops(p_a uuid, p_b uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  a visits%rowtype;
  b visits%rowtype;
  v_t0 timestamptz;
  v_lo timestamptz;
  v_hi timestamptz;
  v_first timestamptz; -- first dot on the way
  v_last timestamptz;  -- last dot on the way
  v_leave timestamptz;
  v_arrive timestamptz;
  v_walk interval;
  v_commute uuid;
  v_count integer;
begin
  select * into a from visits where id = p_a and user_id = auth.uid();
  select * into b from visits where id = p_b and user_id = auth.uid();
  if a.id is null or b.id is null or a.departed_at is null then return; end if;
  if meters_between(a.lat, a.lng, b.lat, b.lng) < 80 then return; end if; -- same place
  if b.arrived_at - a.departed_at > interval '30 minutes' then return; end if; -- not next to each other
  v_commute := activity_id_for('Commute');
  if exists (
    select 1 from blocks where user_id = auth.uid() and activity_id = v_commute
      and started_at < b.arrived_at + interval '1 minute' and coalesce(ended_at, 'infinity') > a.departed_at - interval '1 minute'
  ) then return; end if;

  v_t0 := a.departed_at + (b.arrived_at - a.departed_at) / 2;
  v_lo := greatest(a.arrived_at, v_t0 - interval '20 minutes');
  v_hi := least(coalesce(b.departed_at, now()), v_t0 + interval '20 minutes');

  -- Dots on the way: near neither stop.
  select min(at), max(at), count(*) into v_first, v_last, v_count from points
    where user_id = auth.uid() and at > v_lo and at < v_hi
      and (accuracy_m is null or accuracy_m <= 50)
      and meters_between(lat, lng, a.lat, a.lng) > 80 and meters_between(lat, lng, b.lat, b.lng) > 80;

  if v_count >= 2 then -- (one dot on its own could be a glitch)
    -- Left: the last dot still at the first stop before that. Arrived: the first dot at the next one after.
    select coalesce(max(at), v_first - interval '30 seconds') into v_leave from points
      where user_id = auth.uid() and at > v_lo and at < v_first and meters_between(lat, lng, a.lat, a.lng) <= 80;
    select coalesce(min(at), v_last + interval '30 seconds') into v_arrive from points
      where user_id = auth.uid() and at > v_last and at < v_hi and meters_between(lat, lng, b.lat, b.lng) <= 80;
  else
    -- No dots: walking pace (~1.3 m/s), around the switch.
    v_walk := greatest(interval '1 minute', make_interval(secs => meters_between(a.lat, a.lng, b.lat, b.lng) / 1.3));
    v_leave := v_t0 - v_walk / 2;
    v_arrive := v_t0 + v_walk / 2;
  end if;
  v_leave := greatest(v_leave, a.arrived_at + interval '1 minute');
  v_arrive := least(v_arrive, coalesce(b.departed_at, 'infinity') - interval '1 minute');
  if v_arrive <= v_leave then return; end if;

  -- The stops.
  update visits set departed_at = v_leave where id = a.id;
  begin
    update visits set arrived_at = v_arrive where id = b.id;
  exception when unique_violation then null; -- another stop starts at exactly that time: leave it
  end;

  -- The entries either side line up with it: the one before ends when you left, the one after
  -- starts when you got there (only ones switching within 10 minutes of the walk; not ones that
  -- span the whole walk).
  update blocks set ended_at = v_leave, updated_at = now()
    where user_id = auth.uid() and activity_id is distinct from v_commute
      and ended_at > v_leave and ended_at <= v_arrive + interval '10 minutes' and started_at < v_leave;
  update blocks set started_at = v_arrive, updated_at = now()
    where user_id = auth.uid() and activity_id is distinct from v_commute
      and started_at >= v_leave - interval '10 minutes' and started_at < v_arrive + interval '10 minutes'
      and started_at >= v_leave and coalesce(ended_at, 'infinity') > v_arrive + interval '1 minute';

  insert into blocks (started_at, ended_at, activity_id, source, confirmed)
    values (v_leave, v_arrive, v_commute, 'location', true);
end $$;

