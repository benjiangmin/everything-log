-- 074: "Stop it when the calendar event ends" (Nov 24). Run after 073.
--
-- A job (or category) set to it stops at its calendar event's end: CS577 started at 11:00 for the
-- 11:00-12:15 lecture stops at 12:15, even if you're still in the building. Only events that are
-- that job (073: synced, same name, or matching words). Not when the next one of its events starts
-- right after (a lecture, then its discussion).

alter table activities add column if not exists stop_at_event_end boolean;
alter table categories add column if not exists stop_at_event_end boolean;

-- (Its own setting, else its category's, else no.)
create or replace function stops_at_event_end(p_activity uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(a.stop_at_event_end, c.stop_at_event_end, false)
  from activities a left join categories c on c.id = a.category_id
  where a.id = p_activity and a.user_id = auth.uid();
$$;

create or replace function end_at_event_end()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  r record;
begin
  if auth.uid() is null then return; end if;
  for r in
    -- Running entries of such jobs, and the end of their event (the one they started in, up to 30
    -- minutes early), once it's over.
    select b.id, b.activity_id, max(e.ends_at) as ends from blocks b
    join calendar_events e on e.user_id = auth.uid() and not e.all_day and not e.skipped
      and e.starts_at - interval '30 minutes' <= b.started_at and b.started_at < e.ends_at
      and e.ends_at <= now() and e.ends_at - e.starts_at <= interval '16 hours'
    where b.user_id = auth.uid() and b.ended_at is null and stops_at_event_end(b.activity_id)
      and event_job(e.title) = b.activity_id
    group by b.id, b.activity_id
  loop
    -- (Another of its events starting within 10 minutes and still on: keep going.)
    if exists (select 1 from calendar_events e2 where e2.user_id = auth.uid() and not e2.all_day and not e2.skipped
               and e2.starts_at >= r.ends - interval '1 minute' and e2.starts_at <= r.ends + interval '10 minutes'
               and e2.ends_at > now() and event_job(e2.title) = r.activity_id) then
      continue;
    end if;
    update blocks set ended_at = greatest(r.ends, started_at + interval '1 minute'), updated_at = now()
      where id = r.id and ended_at is null;
  end loop;
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
  perform end_at_event_end();
  perform tidy_round_trips(now() - interval '36 hours', now());
end $$;
