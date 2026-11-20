-- Minute by Minute: places have your name for them and the actual place.
--   own_name      what you call it ("Humes"); optional.
--   real_name     the actual place, from Google ("Mosse Humanities Building"), with real_address
--                 and google_id.
--   name          what shows: your name, else the actual place's (kept up to date here).
-- Picking the actual place for a stop links the stop to it and puts it on its spot.

alter table places
  add column if not exists own_name text check (own_name is null or length(btrim(own_name)) between 1 and 80),
  add column if not exists real_name text check (real_name is null or length(btrim(real_name)) between 1 and 200),
  add column if not exists real_address text,
  add column if not exists google_id text;
create unique index if not exists places_google_id on places (user_id, google_id) where google_id is not null;

-- (Every place so far was named by you.)
update places set own_name = name where own_name is null and real_name is null;

create or replace function places_shown_name()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Renamed the old way (only name changed): that's your name for it now.
  if tg_op = 'UPDATE' and new.name is distinct from old.name
     and new.own_name is not distinct from old.own_name and new.real_name is not distinct from old.real_name then
    new.own_name := new.name;
  end if;
  if tg_op = 'INSERT' and new.own_name is null and new.real_name is null then
    new.own_name := new.name;
  end if;
  new.own_name := nullif(btrim(new.own_name), '');
  new.name := left(coalesce(new.own_name, nullif(btrim(new.real_name), ''), new.name), 80);
  return new;
end $$;
drop trigger if exists places_shown_name on places;
create trigger places_shown_name before insert or update on places for each row execute function places_shown_name();

-- An actual place (from Google): yours if you have it already (the same one, or a place of yours
-- without a Google link right there, which it becomes), else a new place.
create or replace function place_for_real(p_real jsonb, p_prefer uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  g text := nullif(btrim(p_real->>'google_id'), '');
  nm text := left(nullif(btrim(p_real->>'name'), ''), 200);
  la double precision := (p_real->>'lat')::double precision;
  ln double precision := (p_real->>'lng')::double precision;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if nm is null or la is null or ln is null then raise exception 'That place has no location.'; end if;
  if g is not null then
    select id into v_id from places where user_id = auth.uid() and google_id = g;
  end if;
  if v_id is null and p_prefer is not null then
    select id into v_id from places where id = p_prefer and user_id = auth.uid() and google_id is null;
  end if;
  if v_id is null then
    select id into v_id from places pl where pl.user_id = auth.uid() and pl.google_id is null
      and (meters_between(pl.lat, pl.lng, la, ln) <= 40 or (pl.outline is not null and near_outline(pl.outline, la, ln, 0)))
      order by meters_between(pl.lat, pl.lng, la, ln) limit 1;
  end if;
  if v_id is null then
    insert into places (name, real_name, real_address, google_id, lat, lng)
      values (left(nm, 80), nm, p_real->>'address', g, la, ln) returning id into v_id;
  else
    update places set real_name = nm, real_address = p_real->>'address', google_id = g,
           outline = case when meters_between(lat, lng, la, ln) > 30 then null else outline end,
           outline_checked = case when meters_between(lat, lng, la, ln) > 30 then false else outline_checked end,
           lat = la, lng = ln
      where id = v_id;
  end if;
  return v_id;
end $$;

-- Name a stop and/or say what actual place it was. p_own: your name (null: leave it, '': none,
-- use the actual place's). p_place: one of your places; or p_real: an actual place from Google.
create or replace function set_stop_place(p_visit uuid, p_own text, p_place uuid, p_real jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v visits%rowtype;
  v_place uuid;
  pl record;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into v from visits where id = p_visit and user_id = auth.uid();
  if v.id is null then raise exception 'That stop is gone'; end if;

  if p_place is not null then
    select id into v_place from places where id = p_place and user_id = auth.uid();
    if v_place is null then raise exception 'That place is gone'; end if;
  elsif p_real is not null then
    v_place := place_for_real(p_real, v.place_id);
  else
    -- Just a name, as before.
    if btrim(coalesce(p_own, '')) = '' then raise exception 'Give it a name, or pick the actual place.'; end if;
    return name_place(p_visit, p_own);
  end if;

  if p_own is not null then
    update places set own_name = nullif(btrim(p_own), ''), name = coalesce(nullif(btrim(p_own), ''), real_name, name) where id = v_place;
  end if;
  select * into pl from places where id = v_place;
  -- The stop is there now (and stays: the phone's next guess doesn't move it).
  update visits set place_id = v_place, lat = pl.lat, lng = pl.lng, pinned = true where id = v.id;
  -- (Other unnamed stops right there: the same place.)
  update visits set place_id = v_place
    where user_id = auth.uid() and place_id is null and id <> v.id and meters_between(lat, lng, pl.lat, pl.lng) <= 40;
  return v_place;
end $$;
