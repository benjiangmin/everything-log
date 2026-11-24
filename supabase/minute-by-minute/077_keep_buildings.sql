-- 077: a place keeps its building when it's matched to a real place (Nov 24). Run after 076.
--
-- Picking the real place for one of yours (Morg → Morgridge Hall) moves its pin to Google's spot.
-- More than 30 m away, its building was thrown out to be looked up again, and when OpenStreetMap
-- didn't answer, it stayed without one (Morg, Noland Hall). Now:
--   * the new spot still in its building: it keeps it;
--   * else a building you already have there (another place's, or a stop's) is used;
--   * only else is it looked up again.
-- And places without a building now get one you already have, where there is one.

-- A building of yours (a place's, else a stop's) that this spot is in. null: none.
create or replace function known_outline(p_lat double precision, p_lng double precision, p_user uuid default auth.uid())
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select o from (
    select outline as o, 0 as pref from places where user_id = p_user and outline is not null and near_outline(outline, p_lat, p_lng, 0)
    union all
    select outline, 1 from visits where user_id = p_user and outline is not null and near_outline(outline, p_lat, p_lng, 0)
  ) x order by pref, jsonb_array_length(o) limit 1;
$$;

-- A place's building after its pin moves from (lat, lng) to (la, ln).
create or replace function outline_at(p_outline jsonb, p_lat double precision, p_lng double precision, la double precision, ln double precision)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select case
    when p_outline is not null and (meters_between(p_lat, p_lng, la, ln) <= 30 or near_outline(p_outline, la, ln, 15)) then p_outline
    else known_outline(la, ln)
  end;
$$;

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
    insert into places (name, real_name, real_address, google_id, lat, lng, outline, outline_checked)
      values (left(nm, 80), nm, p_real->>'address', g, la, ln, known_outline(la, ln), known_outline(la, ln) is not null) returning id into v_id;
  else
    update places set real_name = nm, real_address = p_real->>'address', google_id = g,
           outline = outline_at(outline, lat, lng, la, ln),
           outline_checked = outline_at(outline, lat, lng, la, ln) is not null or (outline_checked and meters_between(lat, lng, la, ln) <= 30),
           lat = la, lng = ln
      where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function edit_place(p_id uuid, p_own text, p_real jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  g text := nullif(btrim(p_real->>'google_id'), '');
  other text;
begin
  if not exists (select 1 from places where id = p_id and user_id = auth.uid()) then raise exception 'That place is gone.'; end if;
  if p_real is not null then
    select name into other from places where user_id = auth.uid() and google_id = g and id <> p_id;
    if other is not null then raise exception 'That''s already your place "%". Merge them instead.', other; end if;
    update places set real_name = left(nullif(btrim(p_real->>'name'), ''), 200), real_address = p_real->>'address', google_id = g,
           outline = outline_at(outline, lat, lng, (p_real->>'lat')::float8, (p_real->>'lng')::float8),
           outline_checked = outline_at(outline, lat, lng, (p_real->>'lat')::float8, (p_real->>'lng')::float8) is not null
                             or (outline_checked and meters_between(lat, lng, (p_real->>'lat')::float8, (p_real->>'lng')::float8) <= 30),
           lat = (p_real->>'lat')::float8, lng = (p_real->>'lng')::float8
      where id = p_id;
  end if;
  if p_own is not null then
    update places set own_name = nullif(btrim(p_own), ''), name = coalesce(nullif(btrim(p_own), ''), real_name, name) where id = p_id;
  end if;
end $$;

-- Now: places without a building get one you already have at their spot (Morg, Noland Hall…).
update places p set outline = known_outline(p.lat, p.lng, p.user_id), outline_checked = true
where p.outline is null and known_outline(p.lat, p.lng, p.user_id) is not null;
