-- Letters to self. Paste into Supabase → SQL Editor → Run (once).
-- A letter is "on the way" until its deliver_on date, then waits in "To view" until you open it,
-- then lives in "Past letters".
create table if not exists letters (
  id         uuid primary key default gen_random_uuid(),
  subject    text not null,
  body       text not null,            -- a tiny bit of safe HTML (bold / italic / underline / lists)
  written_on date,
  deliver_on date not null,
  opened_at  timestamptz,              -- set the first time you open it
  created_at timestamptz not null default now()
);

create index if not exists letters_deliver_on on letters (deliver_on);

alter table letters enable row level security; -- no policies: only the server (secret key) can read/write
