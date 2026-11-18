-- Minute by Minute: a night at home is one stop.
-- While the phone sits still for hours (overnight), iOS can pause recording entirely. When it
-- wakes up, the phone starts a new stop at the same spot, so home was two stops with a 7-hour
-- hole between ("No location recorded then"), and your Sleep belonged to neither. Now two stops
-- at the same spot (60 m, or the same building) join whenever the dots between them never go
-- 150 m+ away, however long the hole (up to 16 hours). Takes effect on the phone's next sync
-- (it sends the last 24 hours each time).

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
           (array_agg(lat order by arrived desc))[1] as lat, (array_agg(lng order by arrived desc))[1] as lng,
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
    -- Its place: kept only while it's still close enough (a place given by the old, looser
    -- rule to a stop next door, like Theory for Estacion Inka, is worked out again), unless you
    -- moved the stop yourself.
    if v_place is not null and not coalesce(v_pinned, false)
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
          values (x.arrived, x.departed, x.lat, x.lng, x.radius, place_for_stop(x.lat, x.lng, x.radius), 'locokit', x.id, v_outline, v_outline is not null);
      else
        -- Its times always follow the phone. Its spot too, unless you moved it or it's a named place.
        update visits set arrived_at = x.arrived, departed_at = x.departed, accuracy_m = x.radius,
            lat = case when v_pinned or v_place is not null then lat else x.lat end,
            lng = case when v_pinned or v_place is not null then lng else x.lng end,
            place_id = coalesce(v_place, place_for_stop(x.lat, x.lng, x.radius)),
            outline = v_outline,
            outline_checked = outline_checked or v_outline is not null
          where id = v_id;
      end if;
    exception when unique_violation or check_violation then
      null; -- another stop starts at the very same moment, or a bad one: skip it, send the rest
    end;
  end loop;

  -- Left a stop: what you started there (and haven't stopped) ends when you left, so the
  -- Commute can go in after it. Only once you've really gone (a dot 150 m+ away within 20
  -- minutes, not the phone wobbling), and not what you started on the move (a podcast on the
  -- way keeps going). Entries you stopped yourself are never changed.
  update blocks b set ended_at = v.departed_at, updated_at = now()
  from visits v
  where b.user_id = auth.uid() and v.user_id = auth.uid() and v.source = 'locokit'
    and v.departed_at is not null and v.departed_at > now() - interval '24 hours'
    and b.ended_at is null and b.source <> 'location'
    and b.started_at >= v.arrived_at - interval '2 minutes' and b.started_at < v.departed_at
    and exists (select 1 from points p where p.user_id = auth.uid() and p.source = 'locokit'
                and p.at > v.departed_at and p.at < v.departed_at + interval '20 minutes'
                and meters_between(p.lat, p.lng, v.lat, v.lng) > 150);
end $$;
