-- Minute by Minute: a default name for every stop, from where you actually are ("Noland Hall",
-- or the street address). The iPhone looks it up in Apple Maps; naming a stop yourself still
-- wins. Run after 005, in the minute-by-minute project. Safe to run again.

alter table visits add column if not exists auto_name text check (length(auto_name) <= 120);

-- The stop's default name, set once (it doesn't overwrite one that's already there).
create or replace function set_auto_name(p_visit_id uuid, p_name text)
returns void
language sql
security invoker
set search_path = public
as $$
  update visits set auto_name = left(btrim(p_name), 120)
  where id = p_visit_id and user_id = auth.uid() and auto_name is null and btrim(coalesce(p_name, '')) <> ''
$$;
