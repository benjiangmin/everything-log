-- Minute by Minute: an icon per job (the phone's Home tiles; long-press a tile to pick one).
-- Run any time. Safe to run again. Empty = one is picked from the job's name.
alter table activities add column if not exists icon text check (icon is null or length(icon) <= 60);
