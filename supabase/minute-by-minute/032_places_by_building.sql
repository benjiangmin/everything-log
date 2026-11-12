-- Minute by Minute: places by their buildings. Run after 031, in the minute-by-minute project.
-- Safe to run again. (Replaces 031's distance rules.)
--
-- Buildings come in every size, so no one distance works for "at this place": 031's tighter
-- distances split stops inside big buildings and dropped places (Morgridge) that were right.
-- Now a place knows its building's outline (the website looks it up from OpenStreetMap, in your
-- browser, once per place), and:
--   - a stop is at a place when it's inside that building (or within ~15-40 m of its walls,
--     depending on how exact the stop is), however big or small the building;
--   - two stops a moment apart in the same building are one stop;
--   - a place without an outline yet works as it did before 031 (its radius, 100 m).
-- The next sync from the phone redoes the last 24 hours this way.

alter table places add column if not exists outline jsonb;
alter table places add column if not exists outline_checked boolean not null default false;
alter table visits add column if not exists outline jsonb;
alter table visits add column if not exists outline_checked boolean not null default false;

-- (As in 021.) Is a spot inside an outline, or within buf metres of its edge?
create or replace function near_outline(o jsonb, plat double precision, plng double precision, buf double precision default 12)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  n integer;
  j integer;
  k double precision := cos(radians(plat));
  ax double precision; ay double precision; bx double precision; by_ double precision;
  dx double precision; dy double precision; l double precision; u double precision;
  inside boolean := false;
begin
  if o is null or jsonb_typeof(o) <> 'array' then return false; end if;
  n := jsonb_array_length(o);
  if n < 3 then return false; end if;
  j := n - 1;
  for i in 0 .. n - 1 loop
    ax := ((o->i->>1)::float8 - plng) * k * 111320;  ay := ((o->i->>0)::float8 - plat) * 110540;
    bx := ((o->j->>1)::float8 - plng) * k * 111320;  by_ := ((o->j->>0)::float8 - plat) * 110540;
    if (ay > 0) <> (by_ > 0) and ax + (0 - ay) * (bx - ax) / (by_ - ay) > 0 then inside := not inside; end if;
    dx := bx - ax; dy := by_ - ay; l := dx * dx + dy * dy;
    u := case when l > 0 then greatest(0, least(1, -(ax * dx + ay * dy) / l)) else 0 end;
    if sqrt((ax + u * dx) ^ 2 + (ay + u * dy) ^ 2) <= buf then return true; end if;
    j := i;
  end loop;
  return inside;
end $$;

-- Is a stop (its spot, and how spread out it was) at this place?
create or replace function at_place(p_place uuid, p_lat double precision, p_lng double precision, p_radius double precision)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from places pl
    where pl.id = p_place and pl.user_id = auth.uid()
      and case when pl.outline is not null
               then near_outline(pl.outline, p_lat, p_lng, greatest(15, least(40, coalesce(p_radius, 20))))
               else meters_between(pl.lat, pl.lng, p_lat, p_lng) <= coalesce(pl.radius_m, 100) end
  );
$$;

-- The place a stop is at: the building it's inside first, else the nearest that fits.
create or replace function place_for_stop(p_lat double precision, p_lng double precision, p_radius double precision)
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select pl.id from places pl
  where pl.user_id = auth.uid() and at_place(pl.id, p_lat, p_lng, p_radius)
  order by (pl.outline is not null and near_outline(pl.outline, p_lat, p_lng, 0)) desc, meters_between(pl.lat, pl.lng, p_lat, p_lng)
  limit 1;
$$;

-- The website found a place's building (or that it isn't in one: null).
create or replace function set_place_outline(p_place uuid, p_outline jsonb)
returns void
language sql
security invoker
set search_path = public
as $$
  update places set outline = case when jsonb_typeof(p_outline) = 'array' and jsonb_array_length(p_outline) >= 3 then p_outline else null end,
                    outline_checked = true
  where id = p_place and user_id = auth.uid();
$$;

-- Naming a stop (as in 031, with "at the place" by its building).
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
  if v_place is not null and not v.pinned and not at_place(v_place, v.lat, v.lng, v.accuracy_m) then
    v_place := null; -- (its place is next door: not this one)
  end if;
  if v_place is null then
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
    where user_id = auth.uid() and (id = p_visit_id or (place_id is null and at_place(v_place, lat, lng, accuracy_m)));
  return v_place;
end $$;

-- The phone's sync (same as 031, but "at a place" is decided by the place's building when it's known).
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
      -- (Joined when: less than 3 minutes apart, and either within 60 m, or both at the same
      -- one of your places: the same building, however big.)
      select *, sum(case when pdep is null or arrived - pdep > interval '3 minutes'
                          or (meters_between(lat, lng, plat, plng) > 60 and (pid is null or pid is distinct from ppid)) then 1 else 0 end)
                  over (order by arrived) as grp
      from (
        select s0.*, lag(departed) over w as pdep, lag(lat) over w as plat, lag(lng) over w as plng, lag(pid) over w as ppid
        from (
          select left(e->>'id', 64) as id, (e->>'arrived')::timestamptz as arrived, (e->>'departed')::timestamptz as departed,
                 (e->>'lat')::float8 as lat, (e->>'lng')::float8 as lng, (e->>'radius')::float8 as radius,
                 place_for_stop((e->>'lat')::float8, (e->>'lng')::float8, (e->>'radius')::float8) as pid
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
       and place_for_stop(x.lat, x.lng, x.radius) is null
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

