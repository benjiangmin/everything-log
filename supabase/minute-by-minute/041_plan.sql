-- Minute by Minute: the Plan tab. Your plans live with your Google Calendar events, in
-- calendar_events, so everything that reads your calendar (best guesses, the day bar) sees them:
--   - an event in Google:            id '<calendar id>:<event id>' (kept up to date by the sync)
--   - a plan only in Minute by Minute: id 'mbm:<uuid>' (the sync leaves these alone)
-- A plan's place, when picked from the list as you type (yours, or Google's), is kept too.
alter table calendar_events add column if not exists place_id text;
alter table calendar_events add column if not exists lat double precision;
alter table calendar_events add column if not exists lng double precision;

-- What Google let us do (space-separated scopes): adding to your calendar needs calendar.events.
alter table google_accounts add column if not exists scope text;

-- The sync replaces what Google says in its window, but never your Minute by Minute-only plans,
-- and keeps the place picked for an event.
create or replace function sync_calendar(p_from timestamptz, p_to timestamptz, p_events jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is null then return 0; end if;
  delete from calendar_events c
  where c.user_id = auth.uid() and c.starts_at < p_to and c.ends_at > p_from and c.id not like 'mbm:%'
    and not exists (select 1 from jsonb_array_elements(coalesce(p_events, '[]')) e where e->>'id' = c.id);
  insert into calendar_events (id, title, starts_at, ends_at, all_day, location)
  select left(e->>'id', 300), left(coalesce(e->>'title', ''), 300), (e->>'start')::timestamptz, (e->>'end')::timestamptz,
         coalesce((e->>'allDay')::boolean, false), left(e->>'location', 300)
  from jsonb_array_elements(coalesce(p_events, '[]')) e
  where e->>'id' is not null and (e->>'end')::timestamptz > (e->>'start')::timestamptz
  on conflict (user_id, id) do update set title = excluded.title, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
    all_day = excluded.all_day,
    -- (a new location text means a new place; the same text keeps the one picked)
    place_id = case when calendar_events.location is distinct from excluded.location then null else calendar_events.place_id end,
    lat = case when calendar_events.location is distinct from excluded.location then null else calendar_events.lat end,
    lng = case when calendar_events.location is distinct from excluded.location then null else calendar_events.lng end,
    location = excluded.location, updated_at = now();
  get diagnostics n = row_count;
  update google_accounts set synced_at = now() where user_id = auth.uid();
  return n;
end $$;
