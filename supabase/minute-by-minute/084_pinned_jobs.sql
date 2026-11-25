-- Minute by Minute: your pinned jobs (Home's tiles), on your account so the phone and the website
-- show the same ones. Run once; safe to run again.
alter table profiles add column if not exists pinned_jobs uuid[] not null default '{}';
