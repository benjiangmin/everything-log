-- "Lock other devices": one number that's part of every unlock cookie. Bumping it signs out every
-- browser except the one that bumped it. Paste into Supabase → SQL Editor → Run (once).
create table if not exists site_lock (
  id int primary key default 1 check (id = 1),  -- only ever one row
  epoch int not null default 0
);
insert into site_lock (id, epoch) values (1, 0) on conflict (id) do nothing;

alter table site_lock enable row level security; -- locked to the public, the server uses the secret key
