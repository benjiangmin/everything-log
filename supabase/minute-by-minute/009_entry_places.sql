-- Minute by Minute: where an entry happened ("CS577 was at Morgridge Hall").
-- Run after 008, in the minute-by-minute project. Safe to run again.
--
--   Set a place on an entry, and the phone's stops are fixed to match: a stop that covers that
--   time somewhere else is split (before / during / after), and the "during" part moves to the
--   place. No stop at all then (the phone missed it)? One is added. Each entry remembers its
--   place, so the app learns where you usually do what.

alter table blocks add column if not exists place_id uuid references places on delete set null;

-- A place by name and spot (or the one with that name already within ~300 m).
create or replace function create_place(p_name text, p_lat double precision, p_lng double precision)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'What is this place called?'; end if;
  select id into v_id from places
    where user_id = auth.uid() and lower(name) = lower(btrim(p_name)) and meters_between(lat, lng, p_lat, p_lng) <= 300
    limit 1;
  if v_id is null then
    insert into places (name, lat, lng) values (left(btrim(p_name), 80), p_lat, p_lng) returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function set_entry_place(p_block_id uuid, p_place_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  b blocks%rowtype;
  p places%rowtype;
  v visits%rowtype;
  v_s timestamptz;
  v_e timestamptz;   -- end of the overlap ('infinity' = still going)
  v_dep timestamptz; -- the stop's own end ('infinity' = still there)
  v_bend timestamptz;
  v_min constant interval := interval '2 minutes';
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into b from blocks where id = p_block_id and user_id = auth.uid();
  if b.id is null then raise exception 'That entry is gone'; end if;
  update blocks set place_id = p_place_id, updated_at = now() where id = b.id;
  if p_place_id is null then return; end if;
  select * into p from places where id = p_place_id and user_id = auth.uid();
  if p.id is null then raise exception 'That place is gone'; end if;
  v_bend := coalesce(b.ended_at, 'infinity');

  for v in
    select * from visits
    where user_id = auth.uid() and arrived_at < v_bend and coalesce(departed_at, 'infinity') > b.started_at
      and place_id is distinct from p.id
    order by arrived_at
  loop
    v_s := greatest(v.arrived_at, b.started_at);
    v_dep := coalesce(v.departed_at, 'infinity');
    v_e := least(v_dep, v_bend);
    if v_s - v.arrived_at > v_min then
      -- Before: the stop keeps its start and place, ending when the entry began.
      update visits set departed_at = v_s where id = v.id;
      insert into visits (arrived_at, departed_at, lat, lng, place_id)
        values (v_s, nullif(v_e, 'infinity'), p.lat, p.lng, p.id)
        on conflict (user_id, arrived_at) do nothing;
    else
      -- It starts with the entry: this stop becomes the "during" part.
      update visits set departed_at = nullif(v_e, 'infinity'), lat = p.lat, lng = p.lng, place_id = p.id, auto_name = null
        where id = v.id;
    end if;
    if v_dep > v_e and (v_dep = 'infinity' or v_dep - v_e > v_min) then
      -- After: back where the phone said, until it said you left.
      insert into visits (arrived_at, departed_at, lat, lng, accuracy_m, place_id, auto_name)
        values (v_e, nullif(v_dep, 'infinity'), v.lat, v.lng, v.accuracy_m, v.place_id, v.auto_name)
        on conflict (user_id, arrived_at) do nothing;
    end if;
  end loop;

  -- No stop there at all (the phone missed it): add one for the entry's time.
  if not exists (
    select 1 from visits where user_id = auth.uid() and place_id = p.id
      and arrived_at < v_bend and coalesce(departed_at, 'infinity') > b.started_at
  ) then
    insert into visits (arrived_at, departed_at, lat, lng, place_id)
      values (b.started_at, b.ended_at, p.lat, p.lng, p.id)
      on conflict (user_id, arrived_at) do update set lat = excluded.lat, lng = excluded.lng, place_id = excluded.place_id,
        departed_at = excluded.departed_at, auto_name = null;
  end if;
end $$;

-- record_visit again (same as 008), plus: once a stop's been split, iOS saying "you left" closes
-- the open last part, not the first one.
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

  -- You've just left (the first time we hear about it): Commute starts.
  if p_departed is not null and v_was_departed is null and p_departed > v_recent
     and not exists (select 1 from visits where user_id = auth.uid() and arrived_at > p_departed) then
    v_commute := coalesce(v_commute, activity_id_for('Commute'));
    perform stop_running(p_departed);
    perform place_block(p_departed, null, v_commute, null, 'location', true);
  end if;
  return v_id;
end $$;
