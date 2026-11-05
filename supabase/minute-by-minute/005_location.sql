-- Minute by Minute: where you went. Run after 004, in the minute-by-minute project.
-- Safe to run again.
--
--   points  your route: a dot every so often while you're moving (from the iPhone)
--   visits  a stop: you arrived somewhere and stayed (iOS works these out, low power)
--   places  stops you've named ("Home", "Theory"). A new visit within a place's radius gets it
--           automatically.

create table if not exists places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  lat double precision not null,
  lng double precision not null,
  radius_m integer not null default 100 check (radius_m between 20 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  arrived_at timestamptz not null,
  departed_at timestamptz, -- empty = still there
  lat double precision not null,
  lng double precision not null,
  accuracy_m double precision,
  place_id uuid references places on delete set null,
  created_at timestamptz not null default now(),
  check (departed_at is null or departed_at >= arrived_at)
);
create unique index if not exists visits_arrival on visits (user_id, arrived_at);

create table if not exists points (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  at timestamptz not null,
  lat double precision not null,
  lng double precision not null,
  accuracy_m double precision,
  speed_mps double precision
);
create unique index if not exists points_time on points (user_id, at);

alter table places enable row level security;
alter table visits enable row level security;
alter table points enable row level security;
drop policy if exists "own places" on places;
create policy "own places" on places for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own visits" on visits;
create policy "own visits" on visits for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own points" on points;
create policy "own points" on points for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Distance in meters between two spots (good to a meter or so at city scale).
create or replace function meters_between(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$$;

-- The named place a spot belongs to (the nearest one whose radius covers it), if any.
create or replace function place_at(p_lat double precision, p_lng double precision)
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select id from places
  where user_id = auth.uid() and meters_between(lat, lng, p_lat, p_lng) <= radius_m
  order by meters_between(lat, lng, p_lat, p_lng)
  limit 1
$$;

-- A stop from the phone. iOS reports a visit when you arrive and again when you leave, so this
-- saves it once and fills in the leaving time later (matched by arrival time).
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
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select id into v_id from visits
    where user_id = auth.uid() and arrived_at between p_arrived - interval '2 minutes' and p_arrived + interval '2 minutes'
    order by abs(extract(epoch from arrived_at - p_arrived)) limit 1;
  if v_id is null then
    insert into visits (arrived_at, departed_at, lat, lng, accuracy_m, place_id)
      values (p_arrived, p_departed, p_lat, p_lng, p_accuracy, place_at(p_lat, p_lng))
      returning id into v_id;
  else
    update visits set departed_at = coalesce(p_departed, departed_at) where id = v_id;
  end if;
  return v_id;
end $$;

-- Route dots from the phone, in a batch: [{"at": "...", "lat": .., "lng": .., "acc": .., "speed": ..}, …].
-- Sending the same dot twice is fine. Returns how many were new.
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
  insert into points (at, lat, lng, accuracy_m, speed_mps)
    select (p->>'at')::timestamptz, (p->>'lat')::double precision, (p->>'lng')::double precision,
           nullif(p->>'acc', '')::double precision, nullif(p->>'speed', '')::double precision
    from jsonb_array_elements(coalesce(p_points, '[]'::jsonb)) p
    where p ? 'at' and p ? 'lat' and p ? 'lng'
    on conflict (user_id, at) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Name a stop: makes (or reuses, if there's one right there) a place, and gives it to every
-- visit within its radius, past ones included. Returns the place's id.
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
    where user_id = auth.uid() and (id = p_visit_id or (place_id is null and meters_between(lat, lng, v.lat, v.lng) <= coalesce(p_radius, 100)));
  return v_place;
end $$;
