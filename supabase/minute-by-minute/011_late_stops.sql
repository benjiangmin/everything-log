-- Minute by Minute: stops that iOS reports late, and the phone's own stop detection.
-- Run after 010, in the minute-by-minute project. Safe to run again.
--
--   - A stop that shows up after you've already left it (iOS does this) no longer leaves one long
--     Commute running through it: the automatic Commute is split around the stop
--     (Commute → time at the stop → Commute).
--   - Hearing late that you left somewhere never stops entries you started since.
--   - repair_day(): the same fix for a day that's already recorded (the website runs it when you
--     open a day).
--   - Dots now carry what the phone's motion chip saw: walking, running, cycling, automotive,
--     stationary.

alter table points add column if not exists motion text;

create or replace function add_points(p_points jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into points (at, lat, lng, accuracy_m, speed_mps, motion)
    select (p->>'at')::timestamptz, (p->>'lat')::double precision, (p->>'lng')::double precision,
           nullif(p->>'acc', '')::double precision, nullif(p->>'speed', '')::double precision,
           nullif(left(p->>'motion', 20), '')
    from jsonb_array_elements(coalesce(p_points, '[]'::jsonb)) p
    where p ? 'at' and p ? 'lat' and p ? 'lng'
    on conflict (user_id, at) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- You were at a stop from p_arrived to p_departed: an automatic (location) Commute can't run
-- through it. One that started before ends at the arrival and picks up again at the departure;
-- one that started during it starts at the departure instead.
create or replace function split_commute_at_stop(p_arrived timestamptz, p_departed timestamptz)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  c blocks%rowtype;
  v_commute uuid := activity_id_for('Commute');
  v_min constant interval := interval '1 minute';
begin
  if p_arrived is null or p_departed is null or p_departed - p_arrived < interval '3 minutes' then return; end if;
  for c in
    select * from blocks
    where user_id = auth.uid() and activity_id = v_commute and source = 'location'
      and started_at < p_departed - v_min and coalesce(ended_at, 'infinity') > p_arrived + v_min
  loop
    if c.started_at < p_arrived - v_min then
      update blocks set ended_at = p_arrived, updated_at = now() where id = c.id;
      if coalesce(c.ended_at, 'infinity') > p_departed + v_min then
        insert into blocks (started_at, ended_at, activity_id, source, confirmed)
          values (p_departed, c.ended_at, v_commute, 'location', true);
      end if;
    elsif coalesce(c.ended_at, 'infinity') > p_departed + v_min then
      update blocks set started_at = p_departed, updated_at = now() where id = c.id;
    else
      delete from blocks where id = c.id; -- it was all inside the stop
    end if;
  end loop;
end $$;

-- The same, for every stop in a stretch of time (a day) that's already recorded.
create or replace function repair_day(p_from timestamptz, p_to timestamptz)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v record;
begin
  if auth.uid() is null then return; end if;
  for v in
    select arrived_at, departed_at from visits
    where user_id = auth.uid() and departed_at is not null and arrived_at < p_to and departed_at > p_from
    order by arrived_at
  loop
    perform split_commute_at_stop(v.arrived_at, v.departed_at);
  end loop;
end $$;

-- record_visit again (same as 009), using the two rules above.
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
  v_arrived timestamptz;
  v_was_departed timestamptz;
  v_tail uuid;
  v_commute uuid;
  v_recent timestamptz := now() - interval '3 hours';
  c record;
  prev record;
  v_away timestamptz;
  v_left timestamptz;
  v_next timestamptz;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select id, arrived_at, departed_at into v_id, v_arrived, v_was_departed from visits
    where user_id = auth.uid() and arrived_at between p_arrived - interval '2 minutes' and p_arrived + interval '2 minutes'
    order by abs(extract(epoch from arrived_at - p_arrived)) limit 1;

  if v_id is null then
    -- A new stop: you've arrived somewhere.
    insert into visits (arrived_at, departed_at, lat, lng, accuracy_m, place_id)
      values (p_arrived, p_departed, p_lat, p_lng, p_accuracy, place_at(p_lat, p_lng))
      returning id into v_id;
    if p_departed is not null then
      -- A stop iOS only told us about after you'd left: split the automatic Commute around it.
      perform split_commute_at_stop(p_arrived, p_departed);
    end if;
    if p_arrived > v_recent then
      v_commute := activity_id_for('Commute');
      select id, started_at into c from blocks
        where user_id = auth.uid() and ended_at is null and source = 'location' and activity_id = v_commute and started_at < p_arrived
        order by started_at desc limit 1;
      if c.id is not null then
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
            update blocks set ended_at = v_left, updated_at = now()
              where user_id = auth.uid() and id <> c.id and ended_at = c.started_at and started_at < v_left;
            update blocks set started_at = v_left, updated_at = now() where id = c.id;
            update visits set departed_at = v_left where id = prev.id and departed_at is not null;
          end if;
        end if;
        update blocks set ended_at = greatest(p_arrived, started_at + interval '1 minute'), updated_at = now() where id = c.id;
      end if;
    end if;
  elsif p_departed is not null then
    if v_was_departed is null then
      update visits set departed_at = p_departed where id = v_id;
    else
      -- Already has an end (it was split): close the part that's still open, if there is one.
      update visits set departed_at = p_departed
        where id = (select id from visits
                    where user_id = auth.uid() and departed_at is null and arrived_at > v_arrived and arrived_at < p_departed
                    order by arrived_at desc limit 1)
        returning id into v_tail;
      if v_tail is not null then v_was_departed := null; end if;
    end if;
  end if;

  -- You've just left (the first time we hear about it): Commute starts, unless one is already
  -- there. Entries started after you left are never touched: if one has, the Commute runs until it.
  if p_departed is not null and v_was_departed is null and p_departed > v_recent
     and not exists (select 1 from visits where user_id = auth.uid() and arrived_at > p_departed) then
    v_commute := coalesce(v_commute, activity_id_for('Commute'));
    if not exists (
      select 1 from blocks where user_id = auth.uid() and activity_id = v_commute
        and started_at <= p_departed + interval '1 minute' and coalesce(ended_at, 'infinity') > p_departed
    ) then
      select min(started_at) into v_next from blocks
        where user_id = auth.uid() and started_at > p_departed and activity_id is distinct from v_commute;
      -- What was going on when you left ends then (only things that began before).
      update blocks set ended_at = p_departed, updated_at = now()
        where user_id = auth.uid() and ended_at is null and started_at < p_departed and activity_id is distinct from v_commute;
      if v_next is null or v_next - p_departed > interval '1 minute' then
        insert into blocks (started_at, ended_at, activity_id, source, confirmed)
          values (p_departed, v_next, v_commute, 'location', true);
      end if;
    end if;
  end if;
  return v_id;
end $$;
