-- Minute by Minute: short stops, round trips, and stops in your places' buildings.
--   - A short stop (4+ minutes, was 8) is a stop: 6 minutes in Target counts. Under 4 is still
--     waiting at a crossing; waiting for a ride is still caught by the ride after it.
--   - Out and back to the same place (Pres House → Target → Pres House): when a stop between them
--     is taken back, the Commutes either side become one (you did go somewhere); if the dots never
--     went far, they're removed (you never left).
--   - A stop in the same building as one of your places is that place, named, with its marker in
--     the building, however short, even when indoor GPS put its spot out on the street.

-- One of your places in this building: the same outline, or its spot inside it.
create or replace function same_building_place(p_outline jsonb)
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select pl.id from places pl
  where pl.user_id = auth.uid() and p_outline is not null
    and (pl.outline = p_outline or near_outline(p_outline, pl.lat, pl.lng, 0))
  order by coalesce(pl.outline = p_outline, false) desc, meters_between(pl.lat, pl.lng, (p_outline->0->>0)::float8, (p_outline->0->>1)::float8)
  limit 1;
$$;

-- The website found a stop's building (as 021, plus: if it's one of your places' buildings, the
-- stop is that place).
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
  v_place uuid;
begin
  select * into v from visits where id = p_visit_id and user_id = auth.uid();
  if v.id is null then return; end if;
  o := coalesce(p_outline, (select outline from places where id = v.place_id));
  if o is not null then
    ft := outline_times(o, v.arrived_at, v.departed_at);
    update visits set outline = o, outline_checked = true, arrived_at = ft.arr, departed_at = ft.dep where id = v.id;
    update places set outline = o where id = v.place_id and outline is null;
    if v.place_id is null and not coalesce(v.pinned, false) then
      v_place := same_building_place(o);
      if v_place is not null then
        update visits set place_id = v_place, lat = pl.lat, lng = pl.lng from places pl where visits.id = v.id and pl.id = v_place;
      end if;
    end if;
  else
    update visits set outline_checked = true where id = v.id;
  end if;
exception when unique_violation or check_violation then
  update visits set outline = o, outline_checked = true where id = p_visit_id;
end $$;

-- Stops in a building that's one of your places, from before: named now.
update visits v set place_id = pl.id, lat = pl.lat, lng = pl.lng
from places pl
where v.place_id is null and not coalesce(v.pinned, false) and v.outline is not null
  and pl.user_id = v.user_id and pl.outline = v.outline;

-- Out and back to the same place, with no stop between any more.
create or replace function tidy_round_trips(p_from timestamptz, p_to timestamptz)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  a record;
  v_commute uuid;
  v_went boolean;
begin
  if auth.uid() is null then return; end if;
  select id into v_commute from activities where user_id = auth.uid() and name = 'Commute';
  if v_commute is null then return; end if;
  for a in
    with s as (
      select departed_at, lat, lng, lead(arrived_at) over w as next_at, lead(lat) over w as nlat, lead(lng) over w as nlng
      from visits where user_id = auth.uid() and arrived_at < p_to and coalesce(departed_at, 'infinity') > p_from
      window w as (order by arrived_at)
    )
    select departed_at as left_at, next_at, lat, lng from s
    where departed_at is not null and next_at is not null
      and next_at - departed_at between interval '30 seconds' and interval '3 hours'
      and meters_between(lat, lng, nlat, nlng) <= 100
  loop
    -- Only automatic Commutes in there, and nothing of yours.
    if not exists (select 1 from blocks where user_id = auth.uid() and activity_id = v_commute and source = 'location'
                   and started_at < a.next_at and coalesce(ended_at, 'infinity') > a.left_at) then
      continue;
    end if;
    if exists (select 1 from blocks where user_id = auth.uid() and started_at < a.next_at and coalesce(ended_at, 'infinity') > a.left_at
               and (activity_id is distinct from v_commute or source <> 'location')) then
      continue;
    end if;
    v_went := exists (select 1 from points p where p.user_id = auth.uid() and p.at > a.left_at and p.at < a.next_at
                      and (p.accuracy_m is null or p.accuracy_m <= 65) and meters_between(p.lat, p.lng, a.lat, a.lng) > 150);
    delete from blocks where user_id = auth.uid() and activity_id = v_commute and source = 'location'
      and started_at < a.next_at and coalesce(ended_at, 'infinity') > a.left_at;
    if v_went then
      insert into blocks (started_at, ended_at, activity_id, source, confirmed) values (a.left_at, a.next_at, v_commute, 'location', true);
    end if;
  end loop;
end $$;

create or replace function start_for_you()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  r record;
  v_block uuid;
  v_job uuid;
  v_start timestamptz;
begin
  if auth.uid() is null then return; end if;

  -- Its places.
  for r in
    select v.id as visit, v.arrived_at, a.id as job from visits v
    join activities a on a.user_id = auth.uid()
    cross join lateral job_prefs(a.id) jp
    where v.user_id = auth.uid() and v.arrived_at > now() - interval '24 hours' and v.place_id is not null
      and (v.departed_at is null or v.departed_at > v.arrived_at + interval '5 minutes')
      and jp.auto_start and v.place_id = any (jp.places)
      and not exists (select 1 from auto_starts s where s.user_id = auth.uid() and s.key = 'visit:' || v.id || ':' || a.id)
      and not exists (select 1 from blocks b where b.user_id = auth.uid() and b.activity_id = a.id
                      and b.started_at <= v.arrived_at + interval '5 minutes' and coalesce(b.ended_at, 'infinity') >= v.arrived_at)
    order by v.arrived_at
  loop
    insert into auto_starts (key) values ('visit:' || r.visit || ':' || r.job) on conflict do nothing;
    -- (Started a moment ago by an earlier stop in this same list: still going, so not again.)
    if exists (select 1 from blocks b where b.user_id = auth.uid() and b.activity_id = r.job
               and b.started_at <= r.arrived_at + interval '5 minutes' and coalesce(b.ended_at, 'infinity') >= r.arrived_at) then
      continue;
    end if;
    begin
      insert into blocks (started_at, ended_at, activity_id, source) values (r.arrived_at, null, r.job, 'manual');
    exception when check_violation then null;
    end;
  end loop;

  -- Plans with a place: when you got there (up to 30 minutes early counts; earlier, its start),
  -- if that's before its end and not in the future.
  -- (A plan with no place of its own, for a job with places, e.g. Working out at the gym: it's
  -- at the job's places. That's how "only if it's on my calendar" works: arrive there while it's
  -- planned, and it starts.)
  for r in
    select e.id, e.title, e.starts_at, e.ends_at, v.arrived_at from calendar_events e
    left join lateral (select * from plan_spot(e.lat, e.lng, e.location) limit 1) s on true
    left join lateral (
      select jp.places from activities a cross join lateral job_prefs(a.id) jp
      where a.user_id = auth.uid() and lower(btrim(a.name)) = lower(btrim(e.title))
    ) j on true
    join lateral (
      select vv.arrived_at from visits vv
      where vv.user_id = auth.uid() and vv.arrived_at < e.ends_at
        and coalesce(vv.departed_at, 'infinity') > greatest(e.starts_at - interval '30 minutes', vv.arrived_at)
        and (case when s.lat is not null then meters_between(vv.lat, vv.lng, s.lat, s.lng) <= 120
                  else vv.place_id = any (coalesce(j.places, '{}')) end)
      order by vv.arrived_at desc limit 1
    ) v on true
    where e.user_id = auth.uid() and not e.all_day and not e.skipped and e.started_block is null
      and e.ends_at > now() - interval '24 hours' and e.ends_at - e.starts_at <= interval '16 hours'
      and length(btrim(e.title)) >= 1
  loop
    v_start := case when r.arrived_at >= r.starts_at - interval '30 minutes' then r.arrived_at else r.starts_at end;
    if v_start > now() or v_start >= r.ends_at then continue; end if;
    v_job := job_named(r.title);
    -- (Already going, e.g. it started itself at its place: that's the one.)
    select id into v_block from blocks where user_id = auth.uid() and activity_id = v_job
      and started_at <= v_start + interval '10 minutes' and coalesce(ended_at, 'infinity') > v_start limit 1;
    if v_block is null then
      begin
        insert into blocks (started_at, ended_at, activity_id, source) values (v_start, null, v_job, 'calendar') returning id into v_block;
      exception when check_violation then continue;
      end;
    end if;
    update calendar_events set started_block = v_block where user_id = auth.uid() and id = r.id;
  end loop;

  perform end_jobs_on_leaving();
  perform tidy_round_trips(now() - interval '36 hours', now());
end $$;

-- ---------- The phone's stops (as 043, with 046's changes) ----------
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
