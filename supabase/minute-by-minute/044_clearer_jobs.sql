-- Minute by Minute: clearer job settings, deleting jobs, and tucking one entry under another.
--   - Arriving at a job's places: start it always, only if it's on your calendar then, or never
--     (start_mode). "Only if it's on your calendar": a plan with its name, at that time, starts
--     when you get to one of the job's places (the plan needn't have a place of its own). For
--     Working out vs Volleyball at the same gym.
--   - delete_job: its entries move to another job, or are deleted too.
--   - tuck_between: Work, Coffee, Work back to back: one Work, with Coffee under it.

alter table activities add column if not exists start_mode text check (start_mode in ('always', 'calendar', 'never'));
alter table categories add column if not exists start_mode text check (start_mode in ('always', 'calendar', 'never'));
update activities set start_mode = case when auto_start then 'always' else 'never' end where auto_start is not null and start_mode is null;
update categories set start_mode = case when auto_start then 'always' else 'never' end where auto_start is not null and start_mode is null;

drop function if exists job_prefs(uuid) cascade;
create or replace function job_prefs(p_activity uuid)
returns table (stop_on_commute boolean, places uuid[], auto_start boolean, hide_from_stats boolean, start_mode text)
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(a.stop_on_commute, c.stop_on_commute, true),
         coalesce(a.places, c.places, '{}'::uuid[]),
         coalesce(a.start_mode, c.start_mode, 'never') = 'always',
         coalesce(a.hide_from_stats, c.hide_from_stats, false),
         coalesce(a.start_mode, c.start_mode, 'never')
  from (select 1) one
  left join activities a on a.id = p_activity and a.user_id = auth.uid()
  left join categories c on c.id = a.category_id;
$$;

create or replace function keeps_commutes(p_activity uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select not jp.stop_on_commute or cardinality(jp.places) > 0 from job_prefs(p_activity) jp;
$$;

create or replace function make_room_for_yours(p_from timestamptz, p_to timestamptz)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  m record;
  c record;
  v_min constant interval := interval '1 minute';
begin
  for m in
    select started_at, ended_at from blocks
    where user_id = auth.uid() and source <> 'location' and ended_at is not null
      and started_at < p_to and ended_at > p_from
      and not keeps_commutes(activity_id)
    order by started_at
  loop
    for c in
      select id, started_at, ended_at, activity_id, note, confirmed from blocks
      where user_id = auth.uid() and source = 'location'
        and started_at < m.ended_at and coalesce(ended_at, 'infinity') > m.started_at
    loop
      if c.started_at >= m.started_at and coalesce(c.ended_at, 'infinity') <= m.ended_at then
        delete from blocks where id = c.id;
      elsif c.started_at < m.started_at and coalesce(c.ended_at, 'infinity') > m.ended_at then
        update blocks set ended_at = m.started_at, updated_at = now() where id = c.id;
        insert into blocks (started_at, ended_at, activity_id, note, source, confirmed)
          values (m.ended_at, c.ended_at, c.activity_id, c.note, 'location', c.confirmed);
      elsif c.started_at < m.started_at then
        update blocks set ended_at = m.started_at, updated_at = now() where id = c.id;
      else
        update blocks set started_at = m.ended_at, updated_at = now() where id = c.id;
      end if;
    end loop;
  end loop;
  delete from blocks
    where user_id = auth.uid() and source = 'location' and ended_at is not null and ended_at - started_at < v_min
      and started_at < p_to and ended_at > p_from;
end $$;

create or replace function end_jobs_on_leaving()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  r record;
  nv record;
  v_left timestamptz;
begin
  -- A job with no places of its own (and that stops when commuting): as 027, it ends when you
  -- left the stop where you started it (once you've really gone).
  update blocks b set ended_at = v.departed_at, updated_at = now()
  from visits v
  where b.user_id = auth.uid() and v.user_id = auth.uid() and v.source = 'locokit'
    and v.departed_at is not null and v.departed_at > now() - interval '24 hours'
    and b.ended_at is null and b.source <> 'location'
    and b.started_at >= v.arrived_at - interval '2 minutes' and b.started_at < v.departed_at
    and exists (select 1 from job_prefs(b.activity_id) jp where jp.stop_on_commute and cardinality(jp.places) = 0)
    and exists (select 1 from points p where p.user_id = auth.uid() and p.source = 'locokit'
                and p.at > v.departed_at and p.at < v.departed_at + interval '20 minutes'
                and meters_between(p.lat, p.lng, v.lat, v.lng) > 150);

  -- A job with places: keeps going while you go between them; ends once you arrive somewhere
  -- else, from when you left the last stop before it.
  for r in
    select b.id, b.started_at, jp.places from blocks b cross join lateral job_prefs(b.activity_id) jp
    where b.user_id = auth.uid() and b.ended_at is null and b.source <> 'location'
      and b.started_at > now() - interval '24 hours'
      and jp.stop_on_commute and cardinality(jp.places) > 0
  loop
    select arrived_at into nv from visits
      where user_id = auth.uid() and arrived_at > r.started_at
        and (place_id is null or not (place_id = any (r.places)))
      order by arrived_at limit 1;
    if not found then continue; end if;
    select max(departed_at) into v_left from visits
      where user_id = auth.uid() and departed_at > r.started_at and departed_at <= nv.arrived_at;
    update blocks set ended_at = greatest(coalesce(v_left, nv.arrived_at), started_at + interval '1 minute'), updated_at = now()
      where id = r.id;
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
    left join lateral (
      select jp.places from activities a cross join lateral job_prefs(a.id) jp
      where a.user_id = auth.uid() and lower(btrim(a.name)) = lower(btrim(e.title))
    ) j on true
    join lateral (
      select vv.arrived_at from visits vv
      where vv.user_id = auth.uid() and vv.arrived_at < e.ends_at
        and coalesce(vv.departed_at, 'infinity') > greatest(e.starts_at - interval '30 minutes', vv.arrived_at)
        and (case when s.lat is not null then meters_between(vv.lat, vv.lng, s.lat, s.lng) <= 120
                  else vv.place_id = any (coalesce(j.places, '{}')) end)
      order by vv.arrived_at desc limit 1
    ) v on true
    where e.user_id = auth.uid() and not e.all_day and not e.skipped and e.started_block is null
      and e.ends_at > now() - interval '24 hours' and e.ends_at - e.starts_at <= interval '16 hours'
      and length(btrim(e.title)) >= 1
  loop
    v_start := case when r.arrived_at >= r.starts_at - interval '30 minutes' then r.arrived_at else r.starts_at end;
    if v_start > now() or v_start >= r.ends_at then continue; end if;
    v_job := job_named(r.title);
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
end $$;

-- Delete a job: its entries go to another job (p_move_to), or (null) are deleted with it.
create or replace function delete_job(p_id uuid, p_move_to uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (select 1 from activities where id = p_id and user_id = auth.uid()) then return; end if;
  if p_move_to is not null then
    if not exists (select 1 from activities where id = p_move_to and user_id = auth.uid()) or p_move_to = p_id then
      raise exception 'Pick another job to move them to.';
    end if;
    update blocks set activity_id = p_move_to, updated_at = now() where user_id = auth.uid() and activity_id = p_id;
  else
    delete from blocks where user_id = auth.uid() and activity_id = p_id;
  end if;
  delete from activities where id = p_id and user_id = auth.uid();
end $$;

-- An entry with the same job right before and after it (5 minutes apart or less): the two
-- become one, and it stays as it is, under it.
create or replace function tuck_between(p_block uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  m record;
  b record;
  a record;
begin
  select * into m from blocks where id = p_block and user_id = auth.uid();
  if not found or m.ended_at is null then return false; end if;
  select * into b from blocks where user_id = auth.uid() and id <> m.id and activity_id is not null
    and activity_id is distinct from m.activity_id and ended_at between m.started_at - interval '5 minutes' and m.started_at + interval '1 minute'
    order by ended_at desc limit 1;
  if not found then return false; end if;
  select * into a from blocks where user_id = auth.uid() and id not in (m.id, b.id) and activity_id = b.activity_id
    and started_at between m.ended_at - interval '1 minute' and m.ended_at + interval '5 minutes'
    order by started_at limit 1;
  if not found then return false; end if;
  update blocks set ended_at = a.ended_at, note = coalesce(nullif(concat_ws(' · ', b.note, a.note), ''), null), updated_at = now() where id = b.id;
  delete from blocks where id = a.id;
  return true;
end $$;
