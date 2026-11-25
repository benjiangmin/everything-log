-- Minute by Minute: AI suggestions (off unless you turn them on), and calendar events don't
-- suggest a job when you're far from where it happens. Run once; safe to run again.

-- Your switch (Settings → Notifications). Off by default.
alter table profiles add column if not exists ai_suggestions boolean not null default false;

-- What the AI last said, so it's only asked again when something changed:
--   kind 'suggest'         → { key, keep: [activity ids] }
--   kind 'over:<block id>' → { next_check, nudge: { message, action } | null, dismissed }
create table if not exists ai_state (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null,
  state jsonb not null,
  at timestamptz not null default now(),
  primary key (user_id, kind)
);
alter table ai_state enable row level security;
drop policy if exists "own ai_state" on ai_state;
create policy "own ai_state" on ai_state for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Every call to the AI, for keeping an eye on the cost:
--   select date(at), count(*), sum(tokens_in), sum(tokens_out) from ai_calls group by 1 order by 1 desc;
create table if not exists ai_calls (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  at timestamptz not null default now(),
  kind text not null,
  model text,
  tokens_in int,
  tokens_out int
);
alter table ai_calls enable row level security;
drop policy if exists "own ai_calls" on ai_calls;
create policy "own ai_calls" on ai_calls for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists ai_calls_at on ai_calls (at);

-- suggest(), as in 030, with: where you are between stops (the phone's latest dot), and a
-- calendar event no longer suggests its job when you're far from where it happens.
create or replace function suggest(
  p_at timestamptz default now(),
  p_lat double precision default null,
  p_lng double precision default null,
  p_tz text default 'America/Chicago',
  p_limit integer default 2,
  p_after uuid default null -- what you just finished (else: the last thing you did)
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_tz text := coalesce(nullif(p_tz, ''), 'America/Chicago');
  v_min integer; -- minute of the day now
  v_dow integer; -- day of the week now
  v_prev uuid;
  v_prev_name text;
  v_place uuid;
  v_place_name text;
  v_lat double precision := p_lat;
  v_lng double precision := p_lng;
  v_n integer;
  v_k integer;
  v_out jsonb;
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  v_min := extract(hour from p_at at time zone v_tz)::int * 60 + extract(minute from p_at at time zone v_tz)::int;
  v_dow := extract(isodow from p_at at time zone v_tz)::int;

  -- Where you are: the spot given, or the stop you're at.
  if v_lat is null then
    select coalesce(pl.lat, v.lat), coalesce(pl.lng, v.lng), v.place_id into v_lat, v_lng, v_place
    from visits v left join places pl on pl.id = v.place_id
    where v.user_id = auth.uid() and v.arrived_at <= p_at and coalesce(v.departed_at, 'infinity') > p_at
    order by v.arrived_at desc limit 1;
  end if;
  -- (Between stops: the phone's latest dot, if it's recent.)
  if v_lat is null then
    select lat, lng into v_lat, v_lng from points
    where user_id = auth.uid() and at <= p_at and at > p_at - interval '20 minutes'
    order by at desc limit 1;
  end if;
  if v_place is null and v_lat is not null then
    select id into v_place from places
    where user_id = auth.uid() and meters_between(lat, lng, v_lat, v_lng) <= radius_m
    order by meters_between(lat, lng, v_lat, v_lng) limit 1;
  end if;
  select name into v_place_name from places where id = v_place;

  -- What came before: given, or the last thing you started (not a Commute or Sleep's wake-up).
  v_prev := p_after;
  if v_prev is null then
    select b.activity_id into v_prev from blocks b join activities a on a.id = b.activity_id
    where b.user_id = auth.uid() and b.started_at < p_at and b.started_at > p_at - interval '6 hours'
      and b.source <> 'location' and coalesce(b.confirmed, true)
    order by b.started_at desc limit 1;
  end if;
  select name into v_prev_name from activities where id = v_prev;

  with hist as (
    -- What you've started over the last 4 months (your own entries, not Commutes the phone made).
    select b.activity_id as aid, b.started_at, b.ended_at, b.place_id,
           lag(b.activity_id) over (order by b.started_at) as prev,
           lag(coalesce(b.ended_at, b.started_at)) over (order by b.started_at) as prev_end,
           (extract(hour from b.started_at at time zone v_tz)::int * 60 + extract(minute from b.started_at at time zone v_tz)::int) as m,
           extract(isodow from b.started_at at time zone v_tz)::int as dow
    from blocks b
    where b.user_id = auth.uid() and b.activity_id is not null and b.source <> 'location' and coalesce(b.confirmed, true)
      and b.started_at > p_at - interval '120 days' and b.started_at < p_at
  ), h as (
    select hist.*,
      -- Where it started: the entry's own place, or the stop you were at then.
      coalesce(hist.place_id, (select v.place_id from visits v where v.user_id = auth.uid()
        and v.arrived_at <= hist.started_at + interval '5 minutes' and coalesce(v.departed_at, 'infinity') > hist.started_at
        order by v.arrived_at desc limit 1)) as at_place,
      (select v.lat from visits v where v.user_id = auth.uid() and v.arrived_at <= hist.started_at + interval '5 minutes'
        and coalesce(v.departed_at, 'infinity') > hist.started_at order by v.arrived_at desc limit 1) as vlat,
      (select v.lng from visits v where v.user_id = auth.uid() and v.arrived_at <= hist.started_at + interval '5 minutes'
        and coalesce(v.departed_at, 'infinity') > hist.started_at order by v.arrived_at desc limit 1) as vlng,
      -- Around the same time of day (within an hour, across midnight too).
      least(abs(hist.m - v_min), 1440 - abs(hist.m - v_min)) <= 60 as near_time,
      -- On a similar day (weekday / weekend; the very same weekday counts double).
      case when hist.dow = v_dow then 2 when (hist.dow >= 6) = (v_dow >= 6) then 1 else 0 end as day_match,
      -- Right after the same thing as now.
      (v_prev is not null and hist.prev = v_prev and hist.started_at - hist.prev_end < interval '3 hours') as after_prev
    from hist
  ), ctx as (
    select h.*,
      (v_place is not null and h.at_place = v_place)
        or (v_place is null and v_lat is not null and h.vlat is not null and meters_between(h.vlat, h.vlng, v_lat, v_lng) <= 75) as here
    from h
  ), totals as (
    select count(*) as n,
           count(*) filter (where near_time) as t_all,
           sum(case when near_time then day_match else 0 end) as td_all,
           count(*) filter (where after_prev) as p_all,
           count(*) filter (where here) as l_all
    from ctx
  ), per as (
    select aid, count(*) as n_a,
           count(*) filter (where near_time) as t_a,
           sum(case when near_time then day_match else 0 end) as td_a,
           count(*) filter (where after_prev) as p_a,
           count(*) filter (where here) as l_a,
           count(*) filter (where started_at > p_at - interval '7 days') as recent_a,
           max(started_at) as last_at
    from ctx group by aid
  ), cal as (
    -- Calendar events on now, or starting in the next 20 minutes.
    select title, starts_at, ends_at, name_words(title) as words from calendar_events
    where user_id = auth.uid() and not all_day and starts_at <= p_at + interval '20 minutes' and ends_at > p_at
  ), cal_hit as (
    -- An activity matches an event by name (its words are in the event's title), or by what
    -- you've done during events with that same title before.
    select a.id as aid, max(c.title) as title,
      bool_or(cardinality(name_words(a.name)) > 0 and name_words(a.name) <@ c.words) as by_name,
      max((select count(*) from calendar_events e join blocks b on b.user_id = auth.uid() and b.activity_id = a.id
             and b.started_at < e.ends_at and coalesce(b.ended_at, now()) > e.starts_at
           where e.user_id = auth.uid() and e.title = c.title and e.ends_at < p_at)) as learned
    from cal c cross join activities a
    where a.user_id = auth.uid()
    group by a.id
  ), scored as (
    select a.id, a.name, a.color, p.n_a,
      -- How often you do it at all (a little), and lately.
      ln((coalesce(p.n_a, 0) + 1.0) / (t.n + 20.0)) * 0.6 + least(coalesce(p.recent_a, 0), 5) * 0.08 as s_base,
      -- Each clue: how much more likely it is than usual (log of the lift), only when it's seen it.
      case when t.t_all >= 3 then ln(((coalesce(p.td_a, 0) + 0.5) / (coalesce(p.n_a, 0) * 2 + 1.0)) / ((t.td_all + 0.5) / (t.n * 2 + 1.0))) else 0 end as s_time,
      case when t.p_all >= 2 then ln(((coalesce(p.p_a, 0) + 0.3) / (coalesce(p.n_a, 0) + 1.0)) / ((t.p_all + 0.3) / (t.n + 1.0))) else 0 end as s_prev,
      case when t.l_all >= 2 then ln(((coalesce(p.l_a, 0) + 0.3) / (coalesce(p.n_a, 0) + 1.0)) / ((t.l_all + 0.3) / (t.n + 1.0))) else 0 end as s_here,
      -- (Not when you're far from where it happens: 081.)
      case when coalesce(fa.far, false) then 0 else case when ch.by_name then 2.5 else 0 end + least(coalesce(ch.learned, 0), 4) * 0.6 end as s_cal,
      -- Turned down around this time of day lately.
      -0.5 * least(3, (select count(*) from suggestion_dismissals d where d.user_id = auth.uid() and d.activity_id = a.id
        and d.at > p_at - interval '30 days' and d.at < p_at
        and least(abs((extract(hour from d.at at time zone v_tz)::int * 60 + extract(minute from d.at at time zone v_tz)::int) - v_min),
                  1440 - abs((extract(hour from d.at at time zone v_tz)::int * 60 + extract(minute from d.at at time zone v_tz)::int) - v_min)) <= 90)) as s_no,
      p.t_a, p.p_a, p.l_a, ch.title as cal_title, ch.by_name, ch.learned
    from activities a
    cross join totals t
    left join per p on p.aid = a.id
    left join cal_hit ch on ch.aid = a.id
    -- Far from where it happens: more than 3 km from all of its places, or, with no places of its
    -- own, more than 25 km from every place you've named (out of town).
    left join lateral (
      select case
        when v_lat is null or ch.aid is null then false
        when cardinality(jp.places) > 0 then coalesce((select min(meters_between(pl.lat, pl.lng, v_lat, v_lng)) from places pl where pl.id = any(jp.places)), 0) > 3000
        else coalesce((select min(meters_between(pl.lat, pl.lng, v_lat, v_lng)) from places pl where pl.user_id = auth.uid()), 0) > 25000
      end as far
      from job_prefs(a.id) jp
    ) fa on true
    where a.user_id = auth.uid()
      and a.name not in ('Commute')
      and (p.n_a is not null or ((coalesce(ch.by_name, false) or coalesce(ch.learned, 0) > 0) and not coalesce(fa.far, false)))
      -- Not what's already running.
      and not exists (select 1 from blocks r where r.user_id = auth.uid() and r.ended_at is null and r.activity_id = a.id and r.started_at <= p_at)
  ), ranked as (
    select s.*, s_base + greatest(-1.5, least(2.5, s_time)) + greatest(-1.5, least(2.5, s_prev)) + greatest(-1.5, least(3, s_here)) + s_cal + s_no as score
    from scored s
  ), shares as (
    select r.*, exp(r.score) / sum(exp(r.score)) over () as share, row_number() over (order by r.score desc) as rn
    from ranked r
  ), top as (
    -- The best guess, and the next ones only if they're real contenders (12%+ of the odds).
    select * from shares where rn <= greatest(1, least(p_limit, 5)) and (rn = 1 or share >= 0.12)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'activity_id', id, 'name', name, 'color', color,
      'score', round(score::numeric, 3), 'confidence', round(share::numeric, 3),
      -- Why, in words: the clues that pushed it up the most.
      'why', (select coalesce(jsonb_agg(w order by k desc), '[]'::jsonb) from (values
          (s_cal, case when s_cal > 0 then 'On your calendar: ' || cal_title end),
          (s_here, case when s_here > 0.4 and l_a > 0 then 'You usually do this at ' || coalesce(v_place_name, 'this spot') end),
          (s_prev, case when s_prev > 0.4 and p_a > 0 then 'You often do this after ' || v_prev_name end),
          (s_time, case when s_time > 0.4 and t_a > 0 then 'You usually start this around now' end)
        ) as r(k, w) where w is not null)
    ) order by score desc), '[]'::jsonb)
  into v_out from top;
  return v_out;
end $$;

