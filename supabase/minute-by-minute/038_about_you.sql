-- Minute by Minute: about you, and your averages, for the "Future" page (your life so far and
-- what's likely ahead). Set up on the phone after signing up (or skipped there), or on the site.
create table if not exists profiles (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  name text check (length(name) <= 80),
  birthday date check (birthday > '1900-01-01'),
  sex text check (sex in ('female', 'male')),
  -- The groups U.S. life tables are published for (CDC/NCHS). 'other': use everyone's.
  race text check (race in ('hispanic', 'aian', 'asian', 'black', 'white', 'other')),
  state text check (length(state) <= 40), -- a U.S. state (or D.C.); anything else: the U.S. average
  skipped boolean not null default false, -- said "Skip" on the phone: the website offers it later
  updated_at timestamptz not null default now()
);
alter table profiles enable row level security;
drop policy if exists "own profile" on profiles;
create policy "own profile" on profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Your average day over the last p_days (not counting today): time per activity, and screen
-- time, per day. Only days you were really tracked (4 h or more of entries) count, so a day the
-- phone was off doesn't pull the averages down. One jsonb value (no 1,000-row limit).
create or replace function daily_averages(p_days int default 30, p_tz text default 'America/Chicago')
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with win as (
    select (date_trunc('day', now() at time zone p_tz) - make_interval(days => p_days)) at time zone p_tz as lo,
           date_trunc('day', now() at time zone p_tz) at time zone p_tz as hi
  ),
  b as (
    select a.name, greatest(bl.started_at, w.lo) as s, least(coalesce(bl.ended_at, now()), w.hi) as e
    from blocks bl join activities a on a.id = bl.activity_id, win w
    where bl.user_id = auth.uid() and bl.confirmed
      and bl.started_at < w.hi and coalesce(bl.ended_at, now()) > w.lo
  ),
  days as (
    select (s at time zone p_tz)::date as d from b where e > s
    group by 1 having sum(extract(epoch from e - s)) >= 4 * 3600
  ),
  per as (
    select name, sum(extract(epoch from e - s)) as secs from b
    where e > s and (s at time zone p_tz)::date in (select d from days)
    group by name
  ),
  screen as (
    select coalesce(sum(extract(epoch from least(coalesce(p.ended_at, now()), w.hi) - greatest(p.started_at, w.lo))), 0) as secs
    from phone_use p, win w
    where p.user_id = auth.uid() and p.kind = 'phone' and p.started_at < w.hi and coalesce(p.ended_at, now()) > w.lo
      and (p.started_at at time zone p_tz)::date in (select d from days)
  )
  select jsonb_build_object(
    'days', (select count(*) from days),
    'perDay', coalesce((select jsonb_object_agg(name, round(secs / greatest(1, (select count(*) from days)))) from per), '{}'),
    'screenPerDay', (select round(secs / greatest(1, (select count(*) from days))) from screen)
  );
$$;
