-- 079: the actual place decides the building (Nov 24). Run after 078.
--
-- A place's building is the one its actual place's pin (Google's spot) is in. TLE's was found from
-- where your phone had the stop, across State St, and kept when it was linked to Taiwan Little
-- Eats (the pin moved less than 30 m, so the old rule kept the building). Now:
--   * a pin that moves keeps its building only if it's still in it; else one you already have
--     there; else it's looked up again (inside it first, nearest otherwise);
--   * one you adjust by hand (Places → a place → Adjust building) stays, until you change the
--     actual place: then it's found again for the new spot;
--   * once now: every place whose building doesn't have its pin in it is looked up again
--     (the website does it when you next open the Day or Places page), hand-picked ones aside.

alter table places add column if not exists outline_by_hand boolean not null default false;

-- (Its pin moved from (lat, lng) to (la, ln): its building, if the pin's still in it, else one
-- you already have there; null: look it up.)
create or replace function outline_at(p_outline jsonb, p_lat double precision, p_lng double precision, la double precision, ln double precision)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select case when p_outline is not null and near_outline(p_outline, la, ln, 0) then p_outline else known_outline(la, ln) end;
$$;

-- A building you pick by hand (or none: "Not in a building").
create or replace function adjust_place_outline(p_place uuid, p_outline jsonb)
returns void
language sql
security invoker
set search_path = public
as $$
  update places set outline = case when jsonb_typeof(p_outline) = 'array' and jsonb_array_length(p_outline) >= 3 then p_outline else null end,
                    outline_checked = true, outline_by_hand = true
  where id = p_place and user_id = auth.uid();
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
           -- (The same actual place again: its building stays as it is, yours too.)
           outline = case when google_id is not distinct from g then outline else outline_at(outline, lat, lng, la, ln) end,
           outline_checked = case when google_id is not distinct from g then outline_checked else outline_at(outline, lat, lng, la, ln) is not null end,
           outline_by_hand = google_id is not distinct from g and outline_by_hand,
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
           outline = case when google_id is not distinct from g then outline else outline_at(outline, lat, lng, (p_real->>'lat')::float8, (p_real->>'lng')::float8) end,
           outline_checked = case when google_id is not distinct from g then outline_checked else outline_at(outline, lat, lng, (p_real->>'lat')::float8, (p_real->>'lng')::float8) is not null end,
           outline_by_hand = google_id is not distinct from g and outline_by_hand,
           lat = (p_real->>'lat')::float8, lng = (p_real->>'lng')::float8
      where id = p_id;
  end if;
  if p_own is not null then
    update places set own_name = nullif(btrim(p_own), ''), name = coalesce(nullif(btrim(p_own), ''), real_name, name) where id = p_id;
  end if;
end $$;

-- Once: places linked to an actual place whose building doesn't have their pin in it get looked
-- up again (their building stays shown until a new one's found).
update places set outline_checked = false
where google_id is not null and not outline_by_hand and outline is not null and not near_outline(outline, lat, lng, 0);

grant execute on function adjust_place_outline(uuid, jsonb) to authenticated;
