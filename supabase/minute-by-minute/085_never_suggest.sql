-- Minute by Minute: jobs never to suggest (the phone's Settings → Never suggest), on your account
-- so the phone and the website leave out the same ones. Run once; safe to run again.
alter table profiles add column if not exists never_suggest uuid[] not null default '{}';
