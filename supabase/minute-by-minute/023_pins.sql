-- Minute by Minute: pinned activities on the Stats page ("Time spent"). Run after 022, in the
-- minute-by-minute project. Safe to run again.
-- A pin is just a name: it matches the activity with that name (any capitals), and still shows
-- (as 0m) when there's no time on it, or no activity called that yet.
create table if not exists stat_pins (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  primary key (user_id, name)
);
alter table stat_pins enable row level security;
drop policy if exists "own stat_pins" on stat_pins;
create policy "own stat_pins" on stat_pins for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
