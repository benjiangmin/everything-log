-- 076: pick which Google calendars Minute by Minute reads (Nov 24). Run after 075.
--
-- Every calendar you can see in Google used to be read, including ones others share with you.
-- Now each can be switched off (Sign-in and connections → Calendars). An off calendar's events are
-- left out from the next sync on: they don't show, suggest, or start jobs.

alter table google_accounts add column if not exists calendars_off text[] not null default '{}';
