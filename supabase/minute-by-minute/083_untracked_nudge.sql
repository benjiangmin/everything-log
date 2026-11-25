-- Minute by Minute: a nudge when you've been untracked a while (Settings → Notifications).
-- Minutes; empty = off. Run once; safe to run again.
alter table profiles add column if not exists untracked_after_min int check (untracked_after_min is null or untracked_after_min between 5 and 720);
