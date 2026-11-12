-- Minute by Minute: places next door stay apart. Run after 030, in the minute-by-minute
-- project. Safe to run again.
--
-- Estacion Inka is ~85 m from Theory. Two things lumped them together:
--   - the phone saw a stop outside Theory, a 44-second walk, then the stop at Estacion Inka; the
--     "split stop" rule (026) joined stops up to 120 m apart, so it became one stop;
--   - a stop got a place if it was within the place's radius (100 m), so that stop was Theory.
-- Now stops only join if they're within 60 m, and a stop only gets one of your places if it's
-- close for how exact that stop is: within 2.5x its own spread (at least 50 m, at most the
-- place's radius). Stops already given a place too far away are worked out again on the next
-- sync. Naming a stop that sits too far from its place makes a new place (instead of renaming
-- the other one).

-- How close a stop has to be to one of your places to be there.
create or replace function place_reach(p_place_radius double precision, p_stop_radius double precision)
returns double precision
language sql
immutable
as $$
  select least(coalesce(p_place_radius, 100), greatest(50, 2.5 * coalesce(p_stop_radius, 20)));
$$;

-- The place a stop is at (the nearest within reach), or null.
create or replace function place_for_stop(p_lat double precision, p_lng double precision, p_radius double precision)
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select id from places
  where user_id = auth.uid() and meters_between(lat, lng, p_lat, p_lng) <= place_reach(radius_m, p_radius)
  order by meters_between(lat, lng, p_lat, p_lng)
  limit 1;
$$;

-- Naming a stop (same as before, except: if the stop's place is too far from it, that place is
-- someone else's spot next door; you get a new place instead of renaming that one, and only
-- stops close to it get the name).
create or replace function name_place(p_visit_id uuid, p_name text, p_radius integer default 100)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v visits%rowtype;
  v_place uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into v from visits where id = p_visit_id and user_id = auth.uid();
  if v.id is null then raise exception 'That stop is gone'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'What is this place called?'; end if;

  v_place := v.place_id;
  if v_place is not null and not v.pinned
     and not exists (select 1 from places pl where pl.id = v_place and meters_between(pl.lat, pl.lng, v.lat, v.lng) <= place_reach(pl.radius_m, v.accuracy_m)) then
    v_place := null; -- (its place is next door: not this one)
  end if;
  if v_place is null then
    -- Same name already nearby (within ~300 m)? Use that one instead of making a twin.
    select id into v_place from places
      where user_id = auth.uid() and lower(name) = lower(btrim(p_name)) and meters_between(lat, lng, v.lat, v.lng) <= 300
      limit 1;
  end if;
  if v_place is null then
    insert into places (name, lat, lng, radius_m) values (btrim(p_name), v.lat, v.lng, coalesce(p_radius, 100)) returning id into v_place;
  else
    update places set name = btrim(p_name) where id = v_place;
  end if;

  update visits set place_id = v_place
    where user_id = auth.uid() and (id = p_visit_id or (place_id is null and meters_between(lat, lng, v.lat, v.lng) <= place_reach(p_radius, accuracy_m)));
  return v_place;
end $$;

-- The phone's sync (same as 027, but stops only join up, or get a place, when they're really close).
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

  -- One stop the phone split in two (you moved a bit inside, it saw a 10-second "trip"): back to
  -- one, from the first one's arrival. Stops less than 3 minutes and 60 m apart are joined; the
  -- joined stop keeps the later one's id and spot.
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'arrived', arrived, 'departed', departed, 'lat', lat, 'lng', lng, 'radius', radius) order by arrived), '[]')
    into p_visits
  from (
    select (array_agg(id order by arrived desc))[1] as id, min(arrived) as arrived,
           (array_agg(departed order by arrived desc))[1] as departed,
           (array_agg(lat order by arrived desc))[1] as lat, (array_agg(lng order by arrived desc))[1] as lng,
           (array_agg(radius order by arrived desc))[1] as radius
    from (
      select *, sum(case when pdep is null or arrived - pdep > interval '3 minutes' or meters_between(lat, lng, plat, plng) > 60 then 1 else 0 end)
                  over (order by arrived) as grp
      from (
        select left(e->>'id', 64) as id, (e->>'arrived')::timestamptz as arrived, (e->>'departed')::timestamptz as departed,
               (e->>'lat')::float8 as lat, (e->>'lng')::float8 as lng, (e->>'radius')::float8 as radius,
               lag((e->>'departed')::timestamptz) over w as pdep, lag((e->>'lat')::float8) over w as plat, lag((e->>'lng')::float8) over w as plng
        from jsonb_array_elements(coalesce(p_visits, '[]')) e
        where e->>'id' is not null and e->>'lat' is not null and e->>'lng' is not null and e->>'arrived' is not null
          and not exists (select 1 from lk_removed r where r.user_id = auth.uid() and r.lk_id = e->>'id')
        window w as (order by (e->>'arrived')::timestamptz)
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
    -- The trips either side join up into one Commute. (Kept if a place of yours is right there,
    -- within 35 m, or you moved the stop yourself.)
    if x.departed is not null
       and (x.departed - x.arrived < interval '8 minutes'
            or (x.departed - x.arrived < interval '45 minutes'
                and exists (select 1 from points p where p.user_id = auth.uid() and p.source = 'locokit'
                            and p.at > x.departed and p.at < x.departed + interval '3 minutes' and p.speed_mps >= 6
                            and meters_between(p.lat, p.lng, x.lat, x.lng) <= 100)))
       and not exists (select 1 from places pl where pl.user_id = auth.uid() and meters_between(pl.lat, pl.lng, x.lat, x.lng) <= 35)
       and not exists (select 1 from visits vv where vv.user_id = auth.uid() and vv.lk_id = x.id and vv.pinned) then
      delete from visits where user_id = auth.uid() and lk_id = x.id;
      continue;
    end if;
    select id, place_id, pinned, outline into v_id, v_place, v_pinned, v_outline from visits where user_id = auth.uid() and lk_id = x.id;
    -- Its place: kept only while it's still close enough (a place given by the old, looser
    -- rule to a stop next door, like Theory for Estacion Inka, is worked out again), unless you
    -- moved the stop yourself.
    if v_place is not null and not coalesce(v_pinned, false)
       and not exists (select 1 from places pl where pl.id = v_place and meters_between(pl.lat, pl.lng, x.lat, x.lng) <= place_reach(pl.radius_m, x.radius)) then
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

