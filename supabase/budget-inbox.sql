-- Purchases read from your bank / Venmo alert emails, waiting for you to review in the budget.
-- Paste into Supabase → SQL Editor → Run (once).
create table if not exists budget_inbox (
  id          uuid primary key default gen_random_uuid(),
  email_id    text not null unique,            -- Resend's id for the email (stops doubles)
  status      text not null default 'pending'
              check (status in ('pending', 'added', 'dismissed', 'skipped')),
  source      text,                            -- 'Discover', 'Venmo'… (empty = couldn't read it)
  amount      numeric(12, 2),
  merchant    text,
  note        text,
  spent_on    date,
  reason      text,                            -- why it was skipped
  from_addr   text,                            -- the whole email is kept, so it can be read again
  subject     text,
  body_text   text,
  received_at timestamptz not null default now(),
  entry_id    uuid references entries (id) on delete set null, -- the expense it became
  created_at  timestamptz not null default now()
);

create index if not exists budget_inbox_status_idx on budget_inbox (status, received_at desc);

alter table budget_inbox enable row level security; -- server-only, like everything else
