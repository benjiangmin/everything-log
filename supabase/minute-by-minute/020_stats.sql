-- Minute by Minute: statistics for a stretch of time (a day, week, month or year). Run after 019,
-- in the minute-by-minute project. Safe to run again.
--
-- period_stats(from, to) → one JSON object for the Stats pages:
--   activities      time per activity (overlapping entries each count in full)
--   tracked_seconds time covered by at least one entry
--   gaps            the untracked stretches (10 minutes or longer), oldest first
--   apps            time per app (phone use from the Shortcuts automation)
--   distance_m      distance travelled, from the route dots
-- Only the part up to now counts (the rest of today hasn't happened yet).

create or replace function period_stats(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with lim as (
  select p_from as f, greatest(p_from, least(p_to, now())) as t
),
b as (
  select bl.activity_id, greatest(bl.started_at, lim.f) as s, least(coalesce(bl.ended_at, now()), lim.t) as e
  from blocks bl, lim
  where bl.user_id = auth.uid() and bl.started_at < lim.t and coalesce(bl.ended_at, now()) > lim.f
),
acts as (
  select a.name, a.color, sum(extract(epoch from b.e - b.s)) as secs
  from b join activities a on a.id = b.activity_id
  where b.e > b.s
  group by a.name, a.color
),
-- Entries merged where they overlap, to find what's covered and the gaps between.
ord as (
  select s, e, max(e) over (order by s, e rows between unbounded preceding and 1 preceding) as prev_end
  from b where e > s
),
grp as (
  select s, e, sum(case when prev_end is null or s > prev_end then 1 else 0 end) over (order by s, e) as g from ord
),
merged as (
  select min(s) as s, max(e) as e from grp group by g
),
gaps as (
  select coalesce(lag(e) over (order by s), (select f from lim)) as gs, s as ge from merged
  union all
  select coalesce((select max(e) from merged), (select f from lim)), (select t from lim)
),
apps as (
  select coalesce(p.app, 'An app') as app,
         sum(extract(epoch from least(coalesce(p.ended_at, now()), lim.t) - greatest(p.started_at, lim.f))) as secs
  from phone_use p, lim
  where p.user_id = auth.uid() and p.kind = 'app' and p.started_at < lim.t and coalesce(p.ended_at, now()) > lim.f
  group by 1
),
pts as (
  select at, lat, lng, lag(at) over w as pat, lag(lat) over w as plat, lag(lng) over w as plng
  from points, lim
  where user_id = auth.uid() and at >= lim.f and at < lim.t and (accuracy_m is null or accuracy_m <= 65)
  window w as (order by at)
),
-- Steps between dots: not across long gaps (the phone missed it), not impossible jumps (GPS
-- glitches), not tiny wobbles (standing still).
dist as (
  select coalesce(sum(d), 0) as m from (
    select meters_between(plat, plng, lat, lng) as d, extract(epoch from at - pat) as dt from pts where pat is not null
  ) x
  where dt > 0 and dt <= 300 and d > 5 and d / dt < 60
)
select jsonb_build_object(
  'from', (select f from lim),
  'to', (select t from lim),
  'activities', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'color', color, 'seconds', round(secs)) order by secs desc) from acts where secs > 0), '[]'::jsonb),
  'tracked_seconds', coalesce((select round(sum(extract(epoch from e - s))) from merged), 0),
  'gaps', coalesce((select jsonb_agg(jsonb_build_object('start', gs, 'end', ge) order by gs) from (
      select gs, ge from gaps where ge - gs >= interval '10 minutes' order by ge - gs desc limit 500
    ) g), '[]'::jsonb),
  'apps', coalesce((select jsonb_agg(jsonb_build_object('app', app, 'seconds', round(secs)) order by secs desc) from apps where secs > 0), '[]'::jsonb),
  'distance_m', (select round(m) from dist)
);
$$;
