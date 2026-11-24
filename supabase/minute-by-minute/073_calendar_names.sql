-- 073: calendar events find their job even when the names differ (Nov 24). Run after 072.
--
-- "CS 577 LEC 01" on your calendar used to start (or make) a job called exactly that. Now an event
-- belongs to, in order:
--   1. the job you linked it to (Jobs and categories → a job → On your calendar),
--   2. the job with exactly its name,
--   3. the one job whose name's words are all in it (CS577 → "CS 577 LEC 01"; "CS 577" counts as
--      "cs577", the same way suggestions already match),
--   4. else a new job with its name (as before).
-- Also: jobs can be renamed (the website does it; nothing here).

alter table activities add column if not exists calendar_names text[] not null default '{}';

-- The job an event belongs to, without making one (null: none).
create or replace function event_job(p_title text)
returns uuid
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v uuid;
  t text := lower(btrim(coalesce(p_title, '')));
  w text[] := name_words(p_title);
begin
  if t = '' then return null; end if;
  select id into v from activities
    where user_id = auth.uid() and exists (select 1 from unnest(calendar_names) n where lower(btrim(n)) = t)
    order by last_used_at desc nulls last limit 1;
  if v is not null then return v; end if;
  select id into v from activities where user_id = auth.uid() and lower(btrim(name)) = t;
  if v is not null then return v; end if;
  select min(id::text)::uuid into v from activities
    where user_id = auth.uid() and cardinality(name_words(name)) > 0 and name_words(name) <@ w
    having count(*) = 1;
  return v;
end $$;

-- …and starting one: that job, or a new one with the event's name.
create or replace function job_for_event(p_title text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
begin
  return coalesce(event_job(p_title), job_named(p_title));
end $$;

create or replace function start_for_you()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  r record;
  v_block uuid;
  v_job uuid;
  v_start timestamptz;
begin
  if auth.uid() is null then return; end if;

  -- Its places.
  for r in
    select v.id as visit, v.arrived_at, a.id as job from visits v
    join activities a on a.user_id = auth.uid()
    cross join lateral job_prefs(a.id) jp
    where v.user_id = auth.uid() and v.arrived_at > now() - interval '24 hours' and v.place_id is not null
      and (v.departed_at is null or v.departed_at > v.arrived_at + interval '5 minutes')
      and jp.auto_start and v.place_id = any (jp.places)
      and not exists (select 1 from auto_starts s where s.user_id = auth.uid() and s.key = 'visit:' || v.id || ':' || a.id)
      and not exists (select 1 from blocks b where b.user_id = auth.uid() and b.activity_id = a.id
                      and b.started_at <= v.arrived_at + interval '5 minutes' and coalesce(b.ended_at, 'infinity') >= v.arrived_at)
    order by v.arrived_at
  loop
    insert into auto_starts (key) values ('visit:' || r.visit || ':' || r.job) on conflict do nothing;
    -- (Started a moment ago by an earlier stop in this same list: still going, so not again.)
    if exists (select 1 from blocks b where b.user_id = auth.uid() and b.activity_id = r.job
               and b.started_at <= r.arrived_at + interval '5 minutes' and coalesce(b.ended_at, 'infinity') >= r.arrived_at) then
      continue;
    end if;
    begin
      insert into blocks (started_at, ended_at, activity_id, source) values (r.arrived_at, null, r.job, 'manual');
    exception when check_violation then null;
    end;
  end loop;

  -- Plans with a place: when you got there (up to 30 minutes early counts; earlier, its start),
  -- if that's before its end and not in the future.
  -- (A plan with no place of its own, for a job with places, e.g. Working out at the gym: it's
  -- at the job's places. That's how "only if it's on my calendar" works: arrive there while it's
  -- planned, and it starts.)
  for r in
    select e.id, e.title, e.starts_at, e.ends_at, v.arrived_at from calendar_events e
    left join lateral (select * from plan_spot(e.lat, e.lng, e.location) limit 1) s on true
    left join lateral (select jp.places from job_prefs(event_job(e.title)) jp) j on true
    join lateral (
      select vv.arrived_at from visits vv
      where vv.user_id = auth.uid() and vv.arrived_at < e.ends_at
        and coalesce(vv.departed_at, 'infinity') > greatest(e.starts_at - interval '30 minutes', vv.arrived_at)
        and (case when s.lat is not null then meters_between(vv.lat, vv.lng, s.lat, s.lng) <= 120
                  else vv.place_id = any (coalesce(j.places, '{}')) end)
      order by vv.arrived_at desc limit 1
    ) v on true
    where e.user_id = auth.uid() and not e.all_day and not e.skipped and e.started_block is null
      -- (Google Calendar's events start jobs unless you've turned that off, whether or not they're
      -- shown. 064: hiding them used to stop them starting too.)
      and (e.id like 'mbm:%' or not coalesce((select ignore_calendar from profiles where user_id = auth.uid()), false))
      and e.ends_at > now() - interval '24 hours' and e.ends_at - e.starts_at <= interval '16 hours'
      and length(btrim(e.title)) >= 1
  loop
    v_start := case when r.arrived_at >= r.starts_at - interval '30 minutes' then r.arrived_at else r.starts_at end;
    if v_start > now() or v_start >= r.ends_at then continue; end if;
    v_job := job_for_event(r.title);
    -- (Already going, e.g. it started itself at its place: that's the one.)
    select id into v_block from blocks where user_id = auth.uid() and activity_id = v_job
      and started_at <= v_start + interval '10 minutes' and coalesce(ended_at, 'infinity') > v_start limit 1;
    if v_block is null then
      begin
        insert into blocks (started_at, ended_at, activity_id, source) values (v_start, null, v_job, 'calendar') returning id into v_block;
      exception when check_violation then continue;
      end;
    end if;
    update calendar_events set started_block = v_block where user_id = auth.uid() and id = r.id;
  end loop;

  perform end_jobs_on_leaving();
  perform tidy_round_trips(now() - interval '36 hours', now());
end $$;

-- A plan with no place, at its time: start it now (its job, as above), or skip it.
create or replace function answer_plan(p_id text, p_start boolean)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  e record;
  v_block uuid;
begin
  select * into e from calendar_events where user_id = auth.uid() and id = p_id;
  if not found or e.started_block is not null then return e.started_block; end if;
  if not p_start then
    update calendar_events set skipped = true where user_id = auth.uid() and id = p_id;
    return null;
  end if;
  insert into blocks (started_at, ended_at, activity_id, source) values (now(), null, job_for_event(e.title), 'calendar') returning id into v_block;
  update calendar_events set started_block = v_block where user_id = auth.uid() and id = p_id;
  return v_block;
end $$;
