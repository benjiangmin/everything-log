-- The home page's todo list. Paste into Supabase → SQL Editor → Run (once). Safe to run again.
-- Checked-off todos are deleted at the end of the day (the first time the home page loads the
-- next day); unchecked ones stay.
create table if not exists todos (
  id uuid primary key default gen_random_uuid(),
  html text not null default '',          -- the text; only <b>, <i>, <u> (and <br>) kept
  done boolean not null default false,
  done_on date,                           -- the day it was checked off (your time zone)
  done_at timestamptz,                    -- (checked ones are listed in the order they were checked)
  position double precision not null default 0, -- order in the list
  created_at timestamptz not null default now()
);

alter table todos enable row level security; -- no policies: only the server (secret key) can read/write
