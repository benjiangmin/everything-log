-- Minute by Minute: "This route looks wrong". Run after 028, in the minute-by-minute project.
-- Safe to run again.
-- Clicking a trip on the map → "Route looks wrong" saves what was drawn, the dots it came from,
-- and your note. They're the test cases for making routes better: download them all from
-- /mbm/route-reports. Later, the app can learn from them too.
create table if not exists route_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  trip_start timestamptz not null,
  trip_end timestamptz not null,
  from_visit uuid,
  to_visit uuid,
  note text check (length(note) <= 2000),
  drawn jsonb not null,   -- the line(s) the map drew: [[[lat, lng], …], …]
  dots jsonb not null,    -- the dots recorded then: [[iso time, lat, lng, accuracy, speed], …]
  legs jsonb,             -- how it was split: [{mode, start, end}, …]
  version text,           -- which version of the path engine drew it
  created_at timestamptz not null default now()
);
alter table route_reports enable row level security;
drop policy if exists "own route_reports" on route_reports;
create policy "own route_reports" on route_reports for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists route_reports_user on route_reports (user_id, created_at desc);
