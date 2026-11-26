-- Minute by Minute: stops the phone folded into another one go from the website too (they stayed
-- open forever, so you never "left" and jobs didn't stop). sync_locokit_visits as in 086, plus the
-- (087) part. Run once; safe to run again. The next time the phone sends, today fixes itself.

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
begin
  if auth.uid() is null then return; end if;
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
                          when (meters_between(lat, lng, plat, plng) > 60 and (bid is null or bid is distinct from pbid))
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
