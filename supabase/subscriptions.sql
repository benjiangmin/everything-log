-- Subscriptions. Paste into Supabase → SQL Editor → Run (once).
create table if not exists subscriptions (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  price        numeric(10, 2) not null check (price >= 0),
  cycle        text not null default 'monthly' check (cycle in ('monthly', 'yearly')),
  next_charge  date,                 -- optional; rolls forward on its own once it passes
  link         text,                 -- optional, e.g. where to manage / cancel it
  note         text,                 -- (no longer used)
  cancelled_at timestamptz,          -- set = in the faded "Cancelled" section
  created_at   timestamptz not null default now()
);

-- Already ran this file before links existed? This adds the column (safe to run again).
alter table subscriptions add column if not exists link text;

alter table subscriptions enable row level security; -- no policies: only the server (secret key) can read/write
