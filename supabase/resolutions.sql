-- New year's resolutions. Paste into Supabase → SQL Editor → Run (once).
create table if not exists resolutions (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  title text not null,            -- the resolution
  reflection text,                -- how it went (written at the end of the year)
  position integer not null default 0,
  created_at timestamptz not null default now(),
  search_text text generated always as (lower(title || ' ' || coalesce(reflection, ''))) stored
);
create index if not exists resolutions_year on resolutions (year, position);

-- One optional note per year, shown above that year's list.
create table if not exists resolution_years (
  year integer primary key,
  note text
);

alter table resolutions enable row level security;      -- no policies: only the server (secret key) can read/write
alter table resolution_years enable row level security;
