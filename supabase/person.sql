-- The person (things I look for in a partner). Paste into Supabase → SQL Editor → Run (once).
create table if not exists person_items (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  pinned boolean not null default false,  -- shown above "Expand for more details"
  position integer not null default 0,    -- order added (oldest first)
  created_at timestamptz not null default now(),
  search_text text generated always as (lower(body)) stored
);

alter table person_items enable row level security; -- no policies: only the server (secret key) can read/write
