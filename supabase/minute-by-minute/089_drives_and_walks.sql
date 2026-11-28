-- 089: Stops on a drive, and walking around a place (Nov 27).
-- 1. Every stop you drove to and drove away from was dropped as "waiting on your way" (meant for a
--    bus stop: you stand there, then ride off). Culver's (27 min), Abby's place (35 min) and the
--    shops all went, and the whole afternoon became one 4h47m trip. Now that's only when you got
--    there on foot.
-- 2. Walking around one spot (Target's aisles, an hour in Mayfair Mall) is a stop, even when the
--    phone filed it as part of a trip.
-- 3. A trip over 3 hours gets its Commute when the phone has its dots all the way.
-- sync_locokit_visits (from 087) and rebuild_day (from 068) change; nothing else. Run once; safe
-- to run again. Open the phone app afterwards: it re-sends the last 24 hours and they redo.

create or replace function sync_locokit_visits(p_from timestamptz, p_visits jsonb, p_gone text[] default null)
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
  v_bldg uuid;
  ft record;
  v_misread boolean;
  v_orig uuid;
  v_stale boolean;
  v_sent text[];
  v_walks jsonb;
begin
  if auth.uid() is null then return; end if;

  -- (089) Walking around one spot, between drives or right next to a stop: you were there. The
  -- phone files it as part of the trip (it only calls a stop when you stay still): Target, 15
  -- minutes walking the aisles between two drives, wasn't a stop at all; Mayfair Mall was three
  -- short stops with an hour of walking between them. So, from the route dots the phone sent: a
  -- stretch of 4 minutes+ with no driving (a ride: 2 of 3 dots in a row 6 m/s+), where you were
  -- moving about (a quarter of the dots 0.5 m/s+) but going back and forth (it ended less than half
  -- as far from where it began as the way walked: a walk somewhere goes one way), with a drive or
  -- a stop on each side (within 3 minutes). It's sent along with the phone's stops, as a stop of
  -- its own ("walk:" + when it began), and joins the stop next to it (below).
  with stops as (
    select (e->>'arrived')::timestamptz as a, coalesce((e->>'departed')::timestamptz, now()) as d
    from jsonb_array_elements(coalesce(p_visits, '[]')) e
    where e->>'arrived' is not null
  ), pts as (
    select p.at, p.lat, p.lng, coalesce(p.speed_mps, 0) as sp, p.accuracy_m as acc
    from points p
    where p.user_id = auth.uid() and p.source = 'locokit' and p.at > p_from
      and (p.accuracy_m is null or p.accuracy_m <= 65)
      and not exists (select 1 from stops s where p.at between s.a and s.d)
  ), r as (
    select *, (coalesce(lag(sp) over w, 0) >= 6)::int + (sp >= 6)::int + (coalesce(lead(sp) over w, 0) >= 6)::int >= 2 as ride,
           lag(at) over w as pat
    from pts window w as (order by at)
  ), r2 as (
    select *, lag(ride) over w as pride from r window w as (order by at)
  ), g as (
    select *, sum(case when pat is null or ride is distinct from pride or at - pat > interval '10 minutes'
                            or exists (select 1 from stops s where s.a > pat and s.a < at) then 1 else 0 end)
                over (order by at) as grp
    from r2
  ), g2 as (
    select *, lag(lat) over (partition by grp order by at) as qlat, lag(lng) over (partition by grp order by at) as qlng from g
  ), isl as (
    select grp, bool_and(ride) as ride, min(at) as a, max(at) as b,
           sum(case when qlat is null then 0 else meters_between(qlat, qlng, lat, lng) end) as path,
           avg((sp >= 0.5)::int) as walk,
           percentile_cont(0.5) within group (order by lat) as lat,
           percentile_cont(0.5) within group (order by lng) as lng,
           percentile_cont(0.5) within group (order by acc) as acc,
           (array_agg(lat order by at))[1] as flat, (array_agg(lng order by at))[1] as flng,
           (array_agg(lat order by at desc))[1] as llat, (array_agg(lng order by at desc))[1] as llng
    from g2 group by grp
  ), around as (
    select *, lag(ride) over o as before_ride, lag(b) over o as before_end, lead(ride) over o as after_ride, lead(a) over o as after_start
    from isl window o as (order by a)
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', 'walk:' || floor(extract(epoch from i.a))::bigint, 'arrived', i.a, 'departed', i.b,
                                               'lat', i.lat, 'lng', i.lng, 'radius', coalesce(i.acc, 20), 'walk', true)), '[]')
    into v_walks
  from around i
  where not i.ride and i.b - i.a >= interval '4 minutes' and i.walk >= 0.25
    and meters_between(i.flat, i.flng, i.llat, i.llng) < 0.5 * i.path
    and (exists (select 1 from stops s where s.d <= i.a and s.d >= i.a - interval '3 minutes')
         or (i.before_ride and i.a - i.before_end <= interval '3 minutes'))
    and (exists (select 1 from stops s where s.a >= i.b and s.a <= i.b + interval '3 minutes')
         or (i.after_ride and i.after_start - i.b <= interval '3 minutes'))
    and not exists (select 1 from lk_removed r where r.user_id = auth.uid() and r.lk_id = 'walk:' || floor(extract(epoch from i.a))::bigint);
  p_visits := coalesce(p_visits, '[]') || v_walks;
  v_sent := array(select left(e->>'id', 64) from jsonb_array_elements(coalesce(p_visits, '[]')) e where e->>'id' is not null);

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
      select *, sum(case when pdep is null then 1
                          when (meters_between(lat, lng, plat, plng) > 60 and (bid is null or bid is distinct from pbid)
                                -- (089) A walk around right next to a stop is part of it.
                                and not ((walk or pwalk) and arrived - pdep <= interval '3 minutes'))
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
        select s0.*, lag(departed) over w as pdep, lag(lat) over w as plat, lag(lng) over w as plng, lag(bid) over w as pbid,
               coalesce(lag(walk) over w, false) as pwalk
        from (
          select left(e->>'id', 64) as id, (e->>'arrived')::timestamptz as arrived, (e->>'departed')::timestamptz as departed,
                 (e->>'lat')::float8 as lat, (e->>'lng')::float8 as lng, (e->>'radius')::float8 as radius,
                 coalesce((e->>'walk')::boolean, false) as walk,
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

  -- (086) The pieces joined into a later one: their own rows go (the joined stop takes over, from
  -- the first piece's arrival). Left in, the first piece kept the arrival time, so the joined stop
  -- couldn't be saved (two stops can't start at the same moment) and was skipped: Home! from
  -- 12:26 AM showed as ending at 12:40 AM, and the rest of the day at home was missing (Nov 25).
  delete from visits v
    where v.user_id = auth.uid() and v.source = 'locokit' and not v.pinned
      and v.lk_id = any(v_sent)
      and not exists (select 1 from jsonb_array_elements(coalesce(p_visits, '[]')) e where e->>'id' = v.lk_id);

  -- (087) A stop the phone folded into another one (it does that all the time: a few minutes'
  -- "new stop" at home gets merged back into the long one) disappears from the phone without
  -- ever being listed as taken back, so its row stayed, open, forever: two "Home!" stops still
  -- going at once, you never "left" home, and the job you started there never stopped (Nov 25).
  -- So: a stop of ours the phone no longer sends, overlapping one it does send (what it was folded
  -- into), goes. (One that overlaps nothing it sends stays, as 069 wants: missing by chance.)
  delete from visits v
    where v.user_id = auth.uid() and v.source = 'locokit' and not v.pinned
      and coalesce(v.departed_at, 'infinity') > p_from
      and not (v.lk_id = any(v_sent))
      and exists (select 1 from jsonb_array_elements(coalesce(p_visits, '[]')) e
                  where (e->>'arrived')::timestamptz < coalesce(v.departed_at, 'infinity')
                    and coalesce((e->>'departed')::timestamptz, 'infinity') > v.arrived_at);

  -- (069) Only the stops the phone says it took back (p_gone) go. Before, any stop of the last
  -- day the phone didn't list was deleted, so a stop missing from one send for any reason (the
  -- phone mid-way through redoing it) was gone for good: SAC and an evening at home, Nov 22.
  -- (A phone app from before this sends no p_gone: as before.)
  delete from visits v
    where v.user_id = auth.uid() and v.source = 'locokit' and coalesce(v.departed_at, 'infinity') > p_from
      and case when p_gone is null
               then not exists (select 1 from jsonb_array_elements(coalesce(p_visits, '[]')) e where e->>'id' = v.lk_id)
               else v.lk_id = any(p_gone) end;

  -- (089) A walk-around found before that isn't found any more: gone.
  delete from visits v
    where v.user_id = auth.uid() and v.source = 'locokit' and not v.pinned and v.lk_id like 'walk:%'
      and coalesce(v.departed_at, 'infinity') > p_from and not (v.lk_id = any(v_sent));

  for x in
    -- (060) A stop's spot: the middle of its own still dots (median: where you spent most of it),
    -- when there are enough of them; else the phone's. The phone's own center can stay where the
    -- stop began: sitting outside Theory for a bit, then two hours inside, it stayed on the
    -- sidewalk, and was named for the Book Store across the street.
    select left(e->>'id', 64) as id, (e->>'arrived')::timestamptz as arrived, (e->>'departed')::timestamptz as departed,
           coalesce(m.lat, (e->>'lat')::float8) as lat, coalesce(m.lng, (e->>'lng')::float8) as lng, (e->>'radius')::float8 as radius
    from jsonb_array_elements(coalesce(p_visits, '[]')) e
    left join lateral (
      select percentile_cont(0.5) within group (order by p.lat) as lat,
             percentile_cont(0.5) within group (order by p.lng) as lng
      from points p
      where p.user_id = auth.uid() and p.source = 'locokit'
        and p.at >= (e->>'arrived')::timestamptz and p.at <= coalesce((e->>'departed')::timestamptz, now())
        and coalesce(p.speed_mps, 0) <= 0.8 and p.accuracy_m is not null
      having count(*) >= 5
    ) m on true
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
    --   - it was only a few minutes (under 4: a crossing; 046, was 8, which lost real short stops
    --     like 6 minutes in a shop).
    -- The trips either side join up into one Commute. (Kept if it's at one of your places, or you
    -- moved the stop yourself.)
    if x.departed is not null
       and (x.departed - x.arrived < interval '4 minutes'
            or (x.departed - x.arrived < interval '45 minutes'
                and exists (select 1 from points p where p.user_id = auth.uid() and p.source = 'locokit'
                            and p.at > x.departed and p.at < x.departed + interval '3 minutes' and p.speed_mps >= 6
                            and meters_between(p.lat, p.lng, x.lat, x.lng) <= 100)))
       -- (089) Only if you got there on foot. Driven to and driven away from is a place you went
       -- (Culver's, 27 minutes; a friend's place, 35): before, every stop on a drive was dropped.
       and not exists (select 1 from points p where p.user_id = auth.uid() and p.source = 'locokit'
                       and p.at < x.arrived and p.at > x.arrived - interval '3 minutes' and p.speed_mps >= 6)
       and building_place(x.lat, x.lng, 10) is null
       and not exists (select 1 from places pl where pl.user_id = auth.uid() and pl.outline is null and meters_between(pl.lat, pl.lng, x.lat, x.lng) <= 35)
       and not exists (select 1 from visits vv where vv.user_id = auth.uid() and vv.lk_id = x.id and vv.pinned) then
      delete from visits where user_id = auth.uid() and lk_id = x.id;
      continue;
    end if;
    select id, place_id, pinned, outline into v_id, v_place, v_pinned, v_outline from visits where user_id = auth.uid() and lk_id = x.id;
    v_orig := v_place;
    -- (058) The building kept from before is only this stop's while the phone's spot is still in
    -- or at it (within the phone's own size for the stop). The phone moved the stop (it caught up:
    -- Theory, not the Book Store across the street): that building, and the place it brought,
    -- are dropped and worked out again from where the phone says now.
    v_stale := false;
    if not coalesce(v_pinned, false) and v_outline is not null
       and not near_outline(v_outline, x.lat, x.lng, coalesce(x.radius, 0)) then
      v_outline := null;
      v_stale := true;
    end if;
    v_was := v_place;
    v_keep := false;
    v_misread := false;
    -- A long stay (2 hours+) somewhere it was already one of your places keeps it while the
    -- phone's spot wobbles within 60 m of the building (overnight it drifts, e.g. across the
    -- alley), unless the spot is now at another of your places. That includes a stop that lost
    -- its place that way before this fix (its building's outline was kept): it gets it back.
    -- (And a new long stay just outside one of your places' buildings, with no place of its own:
    -- that place, the nearest.)
    -- (046: a stop in the same building as one of your places is that place, however short, even
    -- when the phone's spot drifted out onto the street: indoors, GPS wanders. Checked first, so
    -- the phone's spot can't take it away again.)
    if not coalesce(v_pinned, false) and v_outline is not null then
      v_bldg := same_building_place(v_outline);
      if v_bldg is not null then
        if v_bldg is distinct from v_place then v_was := null; end if; -- (gets the place's spot: see the update)
        v_place := v_bldg;
        v_keep := true;
      end if;
    end if;
    if v_place is null and not v_keep and not coalesce(v_pinned, false) then
      if place_for_stop(x.lat, x.lng, x.radius) is null then
        select id into v_place from places pl where pl.user_id = auth.uid() and pl.outline is not null
          and near_outline(pl.outline, x.lat, x.lng, 60) order by meters_between(pl.lat, pl.lng, x.lat, x.lng) limit 1;
      end if;
    end if;
    if v_keep then
      null; -- (its building's place)
    elsif v_place is not null and not coalesce(v_pinned, false)
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
    -- (054) Nothing else says where it is, and it's a spot the phone has misread before: the
    -- place you said it really was (once you corrected a stop there). Its building and spot too.
    if v_place is null and not coalesce(v_pinned, false) and place_for_stop(x.lat, x.lng, x.radius) is null then
      v_place := misread_place(x.lat, x.lng, x.radius);
      if v_place is not null then
        v_keep := true;
        v_misread := true;
        v_was := null;
        v_outline := (select outline from places where id = v_place);
      end if;
    end if;
    v_outline := coalesce(v_outline, (select outline from places where id = coalesce(v_place, place_for_stop(x.lat, x.lng, x.radius))));

    if v_misread then
      null; -- (the phone's times: its dots were never inside the real building)
    elsif v_outline is not null then
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
      -- (051) And the other way: the phone called it while you were still walking up (dots after
      -- its arrival are still 70 m+ away): you arrived at the first dot that's really there.
      select min(p.at) into v_edge from points p
        where p.user_id = auth.uid() and p.source = 'locokit' and p.at >= x.arrived and p.at <= x.arrived + interval '15 minutes'
          and p.at < coalesce(x.departed, 'infinity') and meters_between(p.lat, p.lng, x.lat, x.lng) <= 50;
      if v_edge is not null and v_edge > x.arrived + interval '20 seconds'
         and exists (select 1 from points q where q.user_id = auth.uid() and q.source = 'locokit' and q.at >= x.arrived and q.at < v_edge
                     and meters_between(q.lat, q.lng, x.lat, x.lng) > 70 and (q.accuracy_m is null or q.accuracy_m <= 65)) then
        x.arrived := v_edge;
      end if;
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
            -- (058: a different place than before: its spot too, not the old place's.)
            lat = case when v_pinned then lat when v_place is not null and (v_was is null or v_place is distinct from v_orig) then (select lat from places where id = v_place)
                       when v_place is not null then lat else x.lat end,
            lng = case when v_pinned then lng when v_place is not null and (v_was is null or v_place is distinct from v_orig) then (select lng from places where id = v_place)
                       when v_place is not null then lng else x.lng end,
            place_id = coalesce(v_place, place_for_stop(x.lat, x.lng, x.radius)),
            outline = v_outline,
            outline_checked = case when v_stale then v_outline is not null else outline_checked or v_outline is not null end
          where id = v_id;
      end if;
    exception when unique_violation or check_violation then
      -- (086) Another stop starts at the very same moment (one you moved yourself, which stays):
      -- this one a second later, rather than not at all.
      begin
        if v_id is null then
          insert into visits (arrived_at, departed_at, lat, lng, accuracy_m, place_id, source, lk_id, outline, outline_checked)
            values (x.arrived + interval '1 second', x.departed, x.lat, x.lng, x.radius, coalesce(v_place, place_for_stop(x.lat, x.lng, x.radius)),
                    'locokit', x.id, v_outline, v_outline is not null);
        end if;
      exception when unique_violation or check_violation then
        null; -- a bad one: skip it, send the rest
      end;
    end;
  end loop;

  -- What starts for you here, and what you leaving stops (043).
  perform start_for_you();
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
  v_lk_since timestamptz;
  v_pieces integer;
  v_start timestamptz;
  v_dist double precision;
  v_dots integer;
begin
  if auth.uid() is null then return; end if;
  perform set_config('mbm.rebuilding', '1', true); -- (so blocks_keep_yours knows these changes are automatic)
  select min(arrived_at) into v_lk_since from visits where user_id = auth.uid() and source = 'locokit';

  if v_lk_since is not null and p_to > v_lk_since then
    -- LocoKit days. An older stop still "open" from before LocoKit: you left it at the first dot
    -- well away from it (so the trip to the next stop gets its Commute and its route), or else
    -- when the next stop began. Also fixes one that was closed at the next stop before.
    update visits v set departed_at = greatest(v.arrived_at, least(
        (select min(n.arrived_at) from visits n where n.user_id = auth.uid() and n.arrived_at > v.arrived_at),
        (select min(p.at) from points p where p.user_id = auth.uid() and p.at > v.arrived_at
           and p.at < coalesce((select min(n.arrived_at) from visits n where n.user_id = auth.uid() and n.arrived_at > v.arrived_at), 'infinity')
           and meters_between(p.lat, p.lng, v.lat, v.lng) > 150)))
      where v.user_id = auth.uid() and v.source <> 'locokit' and v.arrived_at < p_to
        and coalesce(v.departed_at, 'infinity') > p_from - interval '1 day'
        and exists (select 1 from visits n where n.user_id = auth.uid() and n.source = 'locokit' and n.arrived_at > v.arrived_at)
        and (v.departed_at is null or v.departed_at = (
          select min(n.arrived_at) from visits n where n.user_id = auth.uid() and n.arrived_at > v.arrived_at));
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

  -- 4: a Commute for each trip between two stops (somewhere else, within 3 hours; or longer, up to
  -- 16, when the phone has the trip's dots all the way: a 2.5-hour drive went untracked before).
  v_commute := activity_id_for('Commute');
  for a in
    with s as (
      select id, arrived_at, departed_at, lat, lng, source, place_id,
             lead(arrived_at) over w as next_at, lead(lat) over w as next_lat, lead(lng) over w as next_lng,
             lead(source) over w as next_source, lead(place_id) over w as next_place
      from visits where user_id = auth.uid() and arrived_at < p_to and coalesce(departed_at, 'infinity') > p_from - interval '3 hours'
      window w as (order by arrived_at)
    )
    select departed_at as left_at, next_at, source = 'locokit' and next_source = 'locokit' as lk,
           meters_between(lat, lng, next_lat, next_lng) as dist from s
    where departed_at is not null and next_at is not null
      and next_at - departed_at >= interval '30 seconds'
      and (next_at - departed_at <= interval '3 hours'
           or (next_at - departed_at <= interval '16 hours'
               and (select max(gap) from (
                      select t - lag(t) over (order by t) as gap from (
                        select p.at as t from points p where p.user_id = auth.uid() and p.at > departed_at and p.at < next_at
                        union all select departed_at union all select next_at) q) z) <= interval '20 minutes'))
      and (meters_between(lat, lng, next_lat, next_lng) > 100
           -- Next door (under 100 m apart, like home to the Chipotle across the street): still a
           -- trip when they're two different places and the phone saw you walking between them.
           or (place_id is not null and next_place is not null and place_id <> next_place
               and (select count(*) from points p where p.user_id = auth.uid()
                      and p.at > departed_at and p.at < next_at and p.speed_mps >= 0.8) >= 3))
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
    -- When did the trip really start? If the phone has the trip's dots, when you left. If it
    -- missed the trip (no dots: the app wasn't running), the stop "ends" at its last dot, which
    -- can be long before you actually left: then the Commute is only as long as the trip takes
    -- (walking, or a bus for far ones), ending when you got there. The time before stays
    -- untracked, for you to fill in.
    v_start := a.left_at;
    if v_lk_since is not null and a.left_at >= v_lk_since then
      select count(*) into v_dots from points
        where user_id = auth.uid() and at > a.left_at and at < a.next_at and (accuracy_m is null or accuracy_m <= 65);
      if v_dots < 3 then
        v_dist := a.dist * 1.35; -- streets aren't straight
        v_start := greatest(a.left_at, a.next_at - make_interval(secs => greatest(120, v_dist / case when v_dist > 2500 then 5.0 else 1.3 end)));
        -- One made before this was added, covering the whole gap: shortened to match.
        update blocks set started_at = v_start, updated_at = now()
          where user_id = auth.uid() and activity_id = v_commute and source = 'location'
            and started_at >= a.left_at - interval '1 second' and started_at < v_start - interval '1 minute'
            and ended_at > v_start and ended_at <= a.next_at + interval '1 second';
      end if;
    end if;
    -- LocoKit trip with one automatic Commute for it (that you haven't moved), and nothing of
    -- yours in the way: it follows the stops' times as LocoKit fixes them, so the bar and the map agree.
    if a.lk then
      update blocks fit set started_at = v_start, ended_at = a.next_at, updated_at = now()
        where fit.user_id = auth.uid() and fit.activity_id = v_commute and fit.source = 'location' and fit.auto_fit
          and fit.started_at < a.next_at and coalesce(fit.ended_at, 'infinity') > a.left_at
          and (abs(extract(epoch from fit.started_at - v_start)) > 20 or abs(extract(epoch from coalesce(fit.ended_at, now()) - a.next_at)) > 20)
          and (select count(*) from blocks cc where cc.user_id = auth.uid() and cc.activity_id = v_commute
                 and cc.started_at < a.next_at and coalesce(cc.ended_at, 'infinity') > a.left_at) = 1
          and not exists (select 1 from blocks yo where yo.user_id = auth.uid() and yo.id <> fit.id
                 and yo.started_at < a.next_at and coalesce(yo.ended_at, 'infinity') > v_start and yo.source <> 'location');
    end if;
    if exists (
      select 1 from blocks where user_id = auth.uid() and activity_id = v_commute
        and started_at < a.next_at and coalesce(ended_at, 'infinity') > v_start
    ) then continue; end if;
    update blocks set ended_at = v_start, updated_at = now()
      where user_id = auth.uid() and ended_at is null and started_at < v_start and activity_id is distinct from v_commute;
    insert into blocks (started_at, ended_at, activity_id, source, confirmed, auto_fit)
      values (v_start, a.next_at, v_commute, 'location', true, true);
  end loop;

  -- An entry you started at a stop and that leaving ended (at the phone's first idea of when you
  -- left) follows when the phone settles on a slightly later departure: it ends where that trip's
  -- Commute starts, so no sliver of untracked time sits between them. Only up to 2 minutes, and
  -- only with nothing else in between: one you stopped yourself well before leaving keeps its time.
  update blocks y set ended_at = c.started_at, updated_at = now()
    from visits v, blocks c
    where v.user_id = auth.uid() and v.source = 'locokit' and v.departed_at is not null
      and v.departed_at > p_from - interval '3 hours' and v.departed_at < p_to
      and c.user_id = auth.uid() and c.activity_id = v_commute and c.source = 'location'
      and c.started_at between v.departed_at - interval '2 seconds' and v.departed_at + interval '2 seconds'
      and y.user_id = auth.uid() and y.id <> c.id and y.source <> 'location' and y.activity_id is distinct from v_commute
      and y.started_at >= v.arrived_at - interval '2 minutes'
      and y.ended_at >= c.started_at - interval '2 minutes' and y.ended_at < c.started_at
      and not exists (select 1 from blocks z where z.user_id = auth.uid() and z.id not in (y.id, c.id)
                        and z.started_at < c.started_at and coalesce(z.ended_at, 'infinity') > y.ended_at);

  -- No automatic Commute runs through a stop.
  for a in
    select arrived_at, departed_at from visits
    where user_id = auth.uid() and departed_at is not null and arrived_at < p_to and departed_at > p_from - interval '3 hours'
  loop
    perform split_commute_at_stop(a.arrived_at, a.departed_at);
  end loop;
  perform set_config('mbm.rebuilding', '', true);
end $$;
