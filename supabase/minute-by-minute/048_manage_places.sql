-- Minute by Minute: managing your places in one spot (Places page).
--   merge_places   two places that are really one (Home and Home!): everything at the first is
--                  at the second; the first goes.
--   delete_place   a place you don't want: its stops become unnamed (nothing else is lost).
--   edit_place     your name for it, and the actual place it is.

-- (A place's id taken out of jobs' and categories' places lists, or swapped for another.)
create or replace function swap_place_in_lists(p_from uuid, p_into uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update activities set places = coalesce((select array_agg(distinct x) from unnest(array_replace(places, p_from, p_into)) x where x is not null), '{}')
    where user_id = auth.uid() and p_from = any (places);
  update categories set places = coalesce((select array_agg(distinct x) from unnest(array_replace(places, p_from, p_into)) x where x is not null), '{}')
    where user_id = auth.uid() and p_from = any (places);
$$;

create or replace function merge_places(p_from uuid, p_into uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  f record;
begin
  if p_from = p_into then raise exception 'Pick a different place to merge it into.'; end if;
  select * into f from places where id = p_from and user_id = auth.uid();
  if f.id is null or not exists (select 1 from places where id = p_into and user_id = auth.uid()) then
    raise exception 'That place is gone.';
  end if;
  update visits set place_id = p_into where user_id = auth.uid() and place_id = p_from;
  update blocks set place_id = p_into where user_id = auth.uid() and place_id = p_from;
  perform swap_place_in_lists(p_from, p_into);
  -- (Keeps the actual place, if only the one going had it.)
  update places t set real_name = coalesce(t.real_name, f.real_name), real_address = coalesce(t.real_address, f.real_address),
         outline = coalesce(t.outline, f.outline)
    where t.id = p_into;
  delete from places where id = p_from;
  if f.google_id is not null then
    update places set google_id = f.google_id where id = p_into and google_id is null;
  end if;
end $$;

create or replace function delete_place(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform swap_place_in_lists(p_id, null);
  update visits set pinned = false where user_id = auth.uid() and place_id = p_id;
  delete from places where id = p_id and user_id = auth.uid();
end $$;

-- p_own: your name (null: leave it; '': none). p_real: the actual place (null: leave it).
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
           outline = case when meters_between(lat, lng, (p_real->>'lat')::float8, (p_real->>'lng')::float8) > 30 then null else outline end,
           outline_checked = case when meters_between(lat, lng, (p_real->>'lat')::float8, (p_real->>'lng')::float8) > 30 then false else outline_checked end,
           lat = (p_real->>'lat')::float8, lng = (p_real->>'lng')::float8
      where id = p_id;
  end if;
  if p_own is not null then
    update places set own_name = nullif(btrim(p_own), ''), name = coalesce(nullif(btrim(p_own), ''), real_name, name) where id = p_id;
  end if;
end $$;
