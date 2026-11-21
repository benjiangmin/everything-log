-- Minute by Minute: spots the phone misreads, learned from you. Run after 053. Safe to run again.
-- Some places, the phone is sure you're somewhere you aren't: at Theory it can put you, with a
-- sharp ±10 m fix, in front of the Extension Bldg across Lake St, every time. GPS can't tell, so
-- you do: when you say a stop was really one of your places (naming it, or picking the place),
-- and the phone's dots for that stop were somewhere else, that spot is remembered as "the phone
-- misreading <place>". Next time a stop lands on that same spot, with nothing else saying where
-- it is, it's that place.
--   - "Same spot" goes by the phone's own accuracy (the fixes then, and now), not a set distance.
--   - Only where you've corrected it before: nowhere else changes.
--   - Saying a stop there was somewhere else replaces it (it was a real visit after all).

create table if not exists place_misreads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  place_id uuid not null references places on delete cascade,
  lat float8 not null,
  lng float8 not null,
  spread_m float8 not null,  -- how far off the phone said its fixes there could be (their median accuracy)
  created_at timestamptz not null default now()
);
alter table place_misreads enable row level security;
drop policy if exists "own place_misreads" on place_misreads;
create policy "own place_misreads" on place_misreads for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists place_misreads_user on place_misreads (user_id);

-- A stop at this spot (its size from the phone): the place the phone misreads as here, if any.
-- Same spot = within what either reading could be off by (twice the larger of the two).
create or replace function misread_place(p_lat float8, p_lng float8, p_radius float8)
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select m.place_id from place_misreads m
  where m.user_id = auth.uid()
    and meters_between(m.lat, m.lng, p_lat, p_lng) <= 2 * greatest(m.spread_m, coalesce(p_radius, 0))
  order by meters_between(m.lat, m.lng, p_lat, p_lng) / greatest(m.spread_m, coalesce(p_radius, 0), 1), m.created_at desc
  limit 1;
$$;

-- You said this stop was really at its place: if the phone's dots for it were somewhere else,
-- remember that spot. (Called by the app after you name a stop or pick its place.)
create or replace function learn_misread(p_visit uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v record;
  pl record;
  s record;
begin
  if auth.uid() is null then return; end if;
  select * into v from visits where id = p_visit and user_id = auth.uid();
  if v is null or v.place_id is null then return; end if;
  select * into pl from places where id = v.place_id and user_id = auth.uid();
  if pl is null then return; end if;
  -- Where the phone had you: the middle of its still dots during the stop, and how sure it was.
  select percentile_cont(0.5) within group (order by p.lat) as lat,
         percentile_cont(0.5) within group (order by p.lng) as lng,
         percentile_cont(0.5) within group (order by p.accuracy_m) as acc,
         count(*) as n
    into s
  from points p
  where p.user_id = auth.uid() and p.source = 'locokit'
    and p.at >= v.arrived_at and p.at <= coalesce(v.departed_at, now())
    and coalesce(p.speed_mps, 0) <= 0.8 and p.accuracy_m is not null;
  if s.n is null or s.n < 3 or s.lat is null then return; end if;
  -- Anything learned at this spot before was about another place: you've now said otherwise.
  delete from place_misreads m where m.user_id = auth.uid() and m.place_id <> pl.id
    and meters_between(m.lat, m.lng, s.lat, s.lng) <= 2 * greatest(m.spread_m, s.acc);
  -- The phone had it right (in the place's building, or as close to its spot as its fixes go):
  -- nothing to learn.
  if (pl.outline is not null and near_outline(pl.outline, s.lat, s.lng, 0))
     or meters_between(pl.lat, pl.lng, s.lat, s.lng) <= 2 * s.acc then
    return;
  end if;
  -- Already known (the same spot for this place): just keep the sharper reading.
  if exists (select 1 from place_misreads m where m.user_id = auth.uid() and m.place_id = pl.id
             and meters_between(m.lat, m.lng, s.lat, s.lng) <= 2 * greatest(m.spread_m, s.acc)) then
    update place_misreads m set spread_m = least(m.spread_m, s.acc)
      where m.user_id = auth.uid() and m.place_id = pl.id
        and meters_between(m.lat, m.lng, s.lat, s.lng) <= 2 * greatest(m.spread_m, s.acc);
    return;
  end if;
  insert into place_misreads (place_id, lat, lng, spread_m) values (pl.id, s.lat, s.lng, s.acc);
end $$;

-- The phone's sync (same as 053, plus the misread spots above).
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
  v_was uuid;
  v_keep boolean;
  v_bldg uuid;
  ft record;
  v_misread boolean;
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
           -- Its spot: the piece inside one of your places' buildings, else the longest one (not
           -- the latest: a short piece on waking up can be across the street).
           (array_agg(lat order by (bid is not null) desc, coalesce(departed, now()) - arrived desc))[1] as lat,
           (array_agg(lng order by (bid is not null) desc, coalesce(departed, now()) - arrived desc))[1] as lng,
           (array_agg(radius order by arrived desc))[1] as radius
    from (
      -- (Joined when: less than 3 minutes apart, and either within 60 m, or both inside the same
      -- building of one of your places, however big. A place's 100 m radius isn't enough.)
      select *, sum(case when pdep is null then 1
                          -- (053) Drift, not a new stop. No fixed distances: it goes by your
                          -- places and by what the dots themselves say.
                          --   - You were at one of your places: inside its building, or a stop you
                          --     (or the app) already put there.
                          --   - The "new stop" is at none of your places.
                          --   - Nothing shows you moved: no dot in between with a fix good enough
                          --     to trust (better than the gap itself) going walking pace or faster.
                          --   - The gap is within what the phone's own fixes there could be off by
                          --     (twice the worst accuracy it reported around then, or the stop's
                          --     own size): a sharp fix 130 m away is real, a ±80 m one isn't.
                          when ppl is not null and apl is null
                               and arrived - pdep <= interval '16 hours'
                               and not exists (select 1 from points p where p.user_id = auth.uid() and p.source = 'locokit'
                                               and p.at > pdep and p.at < arrived
                                               and coalesce(p.speed_mps, 0) > 0.8
                                               and p.accuracy_m is not null and p.accuracy_m < meters_between(lat, lng, plat, plng) / 2)
                               and meters_between(lat, lng, plat, plng) <= 2 * greatest(
                                     coalesce(radius, 0),
                                     coalesce((select max(p.accuracy_m) from points p where p.user_id = auth.uid() and p.source = 'locokit'
                                                 and p.at > pdep - interval '5 minutes' and p.at < arrived + interval '5 minutes'), 0)) then 0
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
        select s0.*, lag(departed) over w as pdep, lag(lat) over w as plat, lag(lng) over w as plng, lag(bid) over w as pbid, lag(apl) over w as ppl
        from (
          select left(e->>'id', 64) as id, (e->>'arrived')::timestamptz as arrived, (e->>'departed')::timestamptz as departed,
                 (e->>'lat')::float8 as lat, (e->>'lng')::float8 as lng, (e->>'radius')::float8 as radius,
                 building_place((e->>'lat')::float8, (e->>'lng')::float8, greatest(15, least(40, coalesce((e->>'radius')::float8, 20)))) as bid,
                 -- (053) At one of your places: in its building, or a stop already put at one.
                 coalesce(building_place((e->>'lat')::float8, (e->>'lng')::float8, greatest(15, least(40, coalesce((e->>'radius')::float8, 20)))),
                          (select v.place_id from visits v where v.user_id = auth.uid() and v.lk_id = left(e->>'id', 64))) as apl
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
            lat = case when v_pinned then lat when v_place is not null and v_was is null then (select lat from places where id = v_place)
                       when v_place is not null then lat else x.lat end,
            lng = case when v_pinned then lng when v_place is not null and v_was is null then (select lng from places where id = v_place)
                       when v_place is not null then lng else x.lng end,
            place_id = coalesce(v_place, place_for_stop(x.lat, x.lng, x.radius)),
            outline = v_outline,
            outline_checked = outline_checked or v_outline is not null
          where id = v_id;
      end if;
    exception when unique_violation or check_violation then
      null; -- another stop starts at the very same moment, or a bad one: skip it, send the rest
    end;
  end loop;

  -- What starts for you here, and what you leaving stops (043).
  perform start_for_you();
end $$;
