-- Minute by Minute: dots from while you were at a stop ("still", 062) are deleted after a week.
-- Run after 062. Safe to run again. They only matter for working out recent stops (where in a
-- stop you were, when you walked out of a building); a week later the day's long settled.
-- Trip dots (your routes, your walking trails) are never touched.

-- Once now.
delete from points where motion = 'still' and at < now() - interval '7 days';

-- Then every night at 4:17 AM Chicago (10:17 UTC), by Supabase's scheduler (pg_cron).
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'mbm-prune-still-dots';
select cron.schedule(
  'mbm-prune-still-dots',
  '17 10 * * *',
  $$delete from public.points where motion = 'still' and at < now() - interval '7 days'$$
);
