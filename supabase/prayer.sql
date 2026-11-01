-- Prayer. Paste into Supabase → SQL Editor → Run (once).
create table if not exists prayers (
  id uuid primary key default gen_random_uuid(),
  title text,                     -- short line, e.g. "Feeling lost?" (optional)
  prayed_on date,                 -- optional
  body text not null,             -- the prayer: a tiny bit of safe HTML (bold / italic / underline / lists)
  position integer not null default 0,   -- order written (newest = highest)
  created_at timestamptz not null default now(),
  search_text text generated always as (
    lower(coalesce(title, '') || ' ' || regexp_replace(body, '<[^>]*>', ' ', 'g'))
  ) stored
);

alter table prayers enable row level security; -- no policies: only the server (secret key) can read/write
