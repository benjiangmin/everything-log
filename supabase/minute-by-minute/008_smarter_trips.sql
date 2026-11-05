-- Minute by Minute: better Commute times, and a remembered route for trips the phone missed.
-- Run after 007, in the minute-by-minute project. Safe to run again.
--
--   Commute times: iOS says "you left" a few minutes late. When you arrive somewhere, the route
--   dots show when you really left the last stop; the automatic Commute is moved to start then
--   (and whatever it stopped ends then too). That stop's "left at" time is fixed to match.
--
--   route_between(from stop, to stop): when the phone missed a trip, the map asks for one you
--   recorded before between the same two places (either direction) and draws that instead.

create or replace function record_visit(
  p_arrived timestamptz,
  p_departed timestamptz,
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_was_departed timestamptz;
  v_commute uuid;
  v_recent timestamptz := now() - interval '3 hours';
  c record;    -- the running automatic Commute
  prev record; -- the stop before this one
  v_away timestamptz;
  v_left timestamptz;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select id, departed_at into v_id, v_was_departed from visits
    where user_id = auth.uid() and arrived_at between p_arrived - interval '2 minutes' and p_arrived + interval '2 minutes'
    order by abs(extract(epoch from arrived_at - p_arrived)) limit 1;

  if v_id is null then
    -- A new stop: you've arrived somewhere.
    insert into visits (arrived_at, departed_at, lat, lng, accuracy_m, place_id)
      values (p_arrived, p_departed, p_lat, p_lng, p_accuracy, place_at(p_lat, p_lng))
      returning id into v_id;
    if p_arrived > v_recent then
      v_commute := activity_id_for('Commute');
      select id, started_at into c from blocks
        where user_id = auth.uid() and ended_at is null and source = 'location' and activity_id = v_commute and started_at < p_arrived
        order by started_at desc limit 1;

      if c.id is not null then
        -- When did you really leave the stop before? The last dot still near it, just before the
        -- first dot well away from it.
        select id, arrived_at, departed_at, lat, lng into prev from visits
          where user_id = auth.uid() and id <> v_id and arrived_at < p_arrived
          order by arrived_at desc limit 1;
        if prev.id is not null then
          select min(at) into v_away from points
            where user_id = auth.uid() and at > prev.arrived_at and at < p_arrived
              and meters_between(lat, lng, prev.lat, prev.lng) > 80;
          if v_away is not null then
            select coalesce(max(at), v_away) into v_left from points
              where user_id = auth.uid() and at > prev.arrived_at and at < v_away
                and meters_between(lat, lng, prev.lat, prev.lng) <= 80;
          end if;
          if v_left is not null and v_left > c.started_at - interval '2 hours' and v_left < p_arrived - interval '1 minute'
             and abs(extract(epoch from v_left - c.started_at)) > 60 then
            -- Whatever the Commute stopped now stops when you really left (only if it began before then).
            update blocks set ended_at = v_left, updated_at = now()
              where user_id = auth.uid() and id <> c.id and ended_at = c.started_at and started_at < v_left;
            update blocks set started_at = v_left, updated_at = now() where id = c.id;
            update visits set departed_at = v_left where id = prev.id and departed_at is not null;
          end if;
        end if;

        update blocks
          set ended_at = greatest(p_arrived, started_at + interval '1 minute'), updated_at = now()
          where id = c.id;
      end if;
    end if;
  else
    update visits set departed_at = coalesce(p_departed, departed_at) where id = v_id;
  end if;

  -- You've just left this stop (the first time we hear about it): Commute starts.
  if p_departed is not null and v_was_departed is null and p_departed > v_recent
     and not exists (select 1 from visits where user_id = auth.uid() and arrived_at > p_departed) then
    v_commute := coalesce(v_commute, activity_id_for('Commute'));
    perform stop_running(p_departed);
    perform place_block(p_departed, null, v_commute, null, 'location', true);
  end if;
  return v_id;
end $$;

-- A route you recorded before between these two stops' places (within 100 m at each end, either
-- direction; the same direction is preferred, then the most recent). [{lat, lng}, …] or null.
create or replace function route_between(p_from uuid, p_to uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  a record;
  b record;
  best record;
begin
  select lat, lng into a from visits where id = p_from and user_id = auth.uid();
  select lat, lng into b from visits where id = p_to and user_id = auth.uid();
  if a is null or b is null then return null; end if;

  with seq as (
    select v.departed_at, v.lat, v.lng,
           lead(v.arrived_at) over w as next_at, lead(v.lat) over w as next_lat, lead(v.lng) over w as next_lng
    from visits v where v.user_id = auth.uid()
    window w as (order by v.arrived_at)
  ),
  trips as (
    select departed_at as left_at, next_at, false as reversed from seq
      where meters_between(lat, lng, a.lat, a.lng) < 100 and meters_between(next_lat, next_lng, b.lat, b.lng) < 100
    union all
    select departed_at, next_at, true from seq
      where meters_between(lat, lng, b.lat, b.lng) < 100 and meters_between(next_lat, next_lng, a.lat, a.lng) < 100
  )
  select t.left_at, t.next_at, t.reversed into best
  from trips t
  where t.left_at is not null and t.next_at is not null and t.next_at - t.left_at between interval '1 minute' and interval '3 hours'
    and (select count(*) from points p where p.user_id = auth.uid() and p.at > t.left_at and p.at < t.next_at) >= 5
  order by t.reversed, t.left_at desc
  limit 1;

  if best is null then return null; end if;
  return (
    select jsonb_agg(jsonb_build_object('lat', p.lat, 'lng', p.lng)
             order by case when best.reversed then -extract(epoch from p.at) else extract(epoch from p.at) end)
    from points p
    where p.user_id = auth.uid() and p.at > best.left_at and p.at < best.next_at
  );
end $$;
