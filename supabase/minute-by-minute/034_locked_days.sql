-- Minute by Minute: finished days are kept as they were. Run after 033, in the minute-by-minute
-- project. Safe to run again.
--
-- Once a day is over (a few hours past midnight) and its map has been drawn, the routes are saved
-- here, and the day isn't worked out again: later rule changes don't redraw old days, and its
-- stops and Commutes aren't rebuilt each time you look. "Redraw" on the map (or moving, renaming
-- or removing one of its stops) unlocks it, and it's saved again the next time it's drawn.
create table if not exists day_locks (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  trips jsonb not null, -- the drawn routes: [{key, start, end, fromId, toId, pieces: [{path, missing}], waits, pace}]
  version text,
  locked_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table day_locks enable row level security;
drop policy if exists "own day_locks" on day_locks;
create policy "own day_locks" on day_locks for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
