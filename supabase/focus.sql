-- Unrecreational records: a stretch of time (a semester, a winter break) with focus areas,
-- each with one log per day. Paste into Supabase → SQL Editor → Run (once).
create table if not exists focus_records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists focus_areas (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references focus_records (id) on delete cascade,
  name text not null,              -- "Guitar"
  goal text,                       -- what you're going for (optional)
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists focus_areas_record on focus_areas (record_id, position);

create table if not exists focus_logs (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references focus_areas (id) on delete cascade,
  entry_date date not null,
  log text not null,               -- what you did / planned
  notes text,                      -- optional: how it went
  created_at timestamptz not null default now(),
  unique (area_id, entry_date),    -- one log per day per focus area
  search_text text generated always as (lower(log || ' ' || coalesce(notes, ''))) stored
);

alter table focus_records enable row level security; -- no policies: only the server (secret key) can read/write
alter table focus_areas enable row level security;
alter table focus_logs enable row level security;
