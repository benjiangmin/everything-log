-- Minute by Minute: stops know their building. Run after 020, in the minute-by-minute project.
-- Safe to run again.
--
-- The website looks up the outline of the building each stop is in (OpenStreetMap) and saves it
-- here (set_stop_outline). Then:
--   - the stop starts when you walked into that outline, and ends when you walked out (dots
--     within 12 m of it count as in: GPS is rough indoors);
--   - the map lights the building up when you hover the stop, and walking around inside it is
--     never drawn as a route.
-- A named place keeps its building, so later stops there get it straight away.
-- Outlines are JSON: [[lat, lng], [lat, lng], …].

alter table visits add column if not exists outline jsonb;
alter table visits add column if not exists outline_checked boolean not null default false;
alter table places add column if not exists outline jsonb;

-- Is a spot inside an outline, or within buf metres of its edge?
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
    -- Metres from the spot (it's at 0, 0).
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

-- A stop's times, fitted to its building: arrived = the first dot in it after the last one
-- outside (looking up to 15 minutes back), left = the last dot in it before the first one
-- outside. Times are only moved when the dots clearly show you crossing the outline.
create or replace function outline_times(o jsonb, p_arr timestamptz, p_dep timestamptz, out arr timestamptz, out dep timestamptz)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  first_in timestamptz;
  last_out timestamptz;
  last_in timestamptz;
  first_out timestamptz;
  t timestamptz;
begin
  arr := p_arr;
  dep := p_dep;
  if o is null then return; end if;

  -- Arriving. (If the phone called the stop while you were still outside, the first dot in it
  -- within 10 minutes.)
  select min(at) into first_in from points
    where user_id = auth.uid() and at >= p_arr and at <= p_arr + interval '10 minutes' and at < coalesce(p_dep, 'infinity')
      and near_outline(o, lat, lng);
  select max(at) into last_out from points
    where user_id = auth.uid() and at >= p_arr - interval '15 minutes' and at <= coalesce(first_in, p_arr)
      and not near_outline(o, lat, lng);
  if last_out is not null then
    select min(at) into t from points
      where user_id = auth.uid() and at > last_out and at <= p_arr + interval '10 minutes' and at < coalesce(p_dep, 'infinity')
        and near_outline(o, lat, lng);
    if t is not null then arr := t; end if;
  end if;

  -- Leaving.
  if p_dep is not null then
    select max(at) into last_in from points
      where user_id = auth.uid() and at <= p_dep and at >= p_dep - interval '10 minutes' and at > arr
        and near_outline(o, lat, lng);
    select min(at) into first_out from points
      where user_id = auth.uid() and at >= coalesce(last_in, p_dep) and at <= p_dep + interval '15 minutes'
        and not near_outline(o, lat, lng);
    if first_out is not null then
      select max(at) into t from points
        where user_id = auth.uid() and at < first_out and at >= p_dep - interval '10 minutes' and at > arr
          and near_outline(o, lat, lng);
      if t is not null then dep := t; end if;
    end if;
  end if;
  if dep is not null and dep <= arr then
    arr := p_arr;
    dep := p_dep;
  end if;
end $$;

-- The website found the building a stop is in (or that it isn't in one: null).
create or replace function set_stop_outline(p_visit_id uuid, p_outline jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v record;
  o jsonb;
  ft record;
begin
  select * into v from visits where id = p_visit_id and user_id = auth.uid();
  if v.id is null then return; end if;
  o := coalesce(p_outline, (select outline from places where id = v.place_id));
  if o is not null then
    ft := outline_times(o, v.arrived_at, v.departed_at);
    update visits set outline = o, outline_checked = true, arrived_at = ft.arr, departed_at = ft.dep where id = v.id;
    update places set outline = o where id = v.place_id and outline is null;
  else
    update visits set outline_checked = true where id = v.id;
  end if;
exception when unique_violation or check_violation then
  update visits set outline = o, outline_checked = true where id = p_visit_id;
end $$;

-- The phone's sync (same as 019, plus: a stop with a building is fitted to it).
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
    select id, place_id, pinned, outline into v_id, v_place, v_pinned, v_outline from visits where user_id = auth.uid() and lk_id = x.id;
    v_outline := coalesce(v_outline, (select outline from places where id = coalesce(v_place, place_at(x.lat, x.lng))));

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
          values (x.arrived, x.departed, x.lat, x.lng, x.radius, place_at(x.lat, x.lng), 'locokit', x.id, v_outline, v_outline is not null);
      else
        -- Its times always follow the phone. Its spot too, unless you moved it or it's a named place.
        update visits set arrived_at = x.arrived, departed_at = x.departed, accuracy_m = x.radius,
            lat = case when v_pinned or v_place is not null then lat else x.lat end,
            lng = case when v_pinned or v_place is not null then lng else x.lng end,
            place_id = coalesce(v_place, place_at(x.lat, x.lng)),
            outline = v_outline,
            outline_checked = outline_checked or v_outline is not null
          where id = v_id;
      end if;
    exception when unique_violation or check_violation then
      null; -- another stop starts at the very same moment, or a bad one: skip it, send the rest
    end;
  end loop;
end $$;
