-- Minute by Minute: a profile with nothing running says "Untracked" and for how long (since their
-- last entry ended), the way it says what's running. social_profile as in 070, plus idle_since.
-- Run once; safe to run again.

create or replace function social_profile(p_user uuid, p_day date default null, p_tz text default 'America/Chicago') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  tz text := coalesce(nullif(p_tz, ''), 'America/Chicago');
  today date := (now() at time zone tz)::date;
  d date := coalesce(p_day, today);
  d_from timestamptz;
  d_to timestamptz;
  out jsonb;
  pinned jsonb := '[]'::jsonb;
  can_days boolean;
begin
  if me is null or social_blocked(me, p_user) or not exists (select 1 from profiles where user_id = p_user) then return null; end if;
  can_days := social_can_see(p_user, me, 'days');
  if can_days then
    select coalesce(jsonb_agg(day order by day desc), '[]'::jsonb) into pinned from shared_days where user_id = p_user and day < today;
  end if;
  -- Another day: only one they pinned, and only if they share pinned days with you.
  if d <> today and not (can_days and exists (select 1 from shared_days where user_id = p_user and day = d)) then
    d := today;
  end if;
  d_from := (d::timestamp) at time zone tz;
  d_to := ((d + 1)::timestamp) at time zone tz;
  out := social_card(p_user) || jsonb_build_object('day', d, 'today', d = today, 'pinned', pinned,
           'sees', jsonb_build_object('now', social_can_see(p_user, me, 'now'), 'bar', social_can_see(p_user, me, 'bar'),
                                      'stats', social_can_see(p_user, me, 'stats'), 'map', social_can_see(p_user, me, 'map')));

  if d = today and social_can_see(p_user, me, 'now') then
    out := out || jsonb_build_object('now', (
      select jsonb_build_object('name', case when a.private or c.private then 'Busy' else coalesce(a.name, 'Something') end,
                                'color', case when a.private or c.private then '#b9ab9b' else coalesce(a.color, '#b9ab9b') end,
                                'since', b.started_at)
      from blocks b left join activities a on a.id = b.activity_id left join categories c on c.id = a.category_id
      where b.user_id = p_user and b.ended_at is null order by b.started_at desc limit 1));
    -- Nothing running: untracked since their last entry ended (082).
    if out->'now' is null or out->'now' = 'null'::jsonb then
      out := out || jsonb_build_object('idle_since', (
        select max(b.ended_at) from blocks b where b.user_id = p_user and b.ended_at <= now() and b.ended_at > now() - interval '2 days'));
    end if;
  end if;

  if social_can_see(p_user, me, 'bar') then
    out := out || jsonb_build_object('bar', coalesce((
      select jsonb_agg(jsonb_build_object('start', greatest(b.started_at, d_from), 'end', least(coalesce(b.ended_at, now()), d_to),
                                          'name', case when a.private or c.private then 'Busy' else coalesce(a.name, 'Something') end,
                                          'color', case when a.private or c.private then '#b9ab9b' else coalesce(a.color, '#b9ab9b') end)
                       order by b.started_at)
      from blocks b left join activities a on a.id = b.activity_id left join categories c on c.id = a.category_id
      where b.user_id = p_user and b.started_at < d_to and coalesce(b.ended_at, now()) > d_from), '[]'::jsonb));
  end if;

  if social_can_see(p_user, me, 'stats') then
    out := out || jsonb_build_object('stats', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'color', color, 'seconds', seconds) order by seconds desc)
      from (
        select case when a.private or c.private then 'Busy' else coalesce(a.name, 'Something') end as name,
               min(case when a.private or c.private then '#b9ab9b' else coalesce(a.color, '#b9ab9b') end) as color,
               sum(extract(epoch from least(coalesce(b.ended_at, now()), d_to) - greatest(b.started_at, d_from)))::int as seconds
        from blocks b left join activities a on a.id = b.activity_id left join categories c on c.id = a.category_id
        where b.user_id = p_user and b.started_at < d_to and coalesce(b.ended_at, now()) > d_from
        group by 1
      ) t where seconds > 0), '[]'::jsonb));
  end if;

  -- The map: stops (named by place) and the route dots, thinned to at most ~1500.
  if social_can_see(p_user, me, 'map') then
    out := out || jsonb_build_object(
      'stops', coalesce((
        select jsonb_agg(jsonb_build_object('arrived', v.arrived_at, 'departed', v.departed_at, 'lat', coalesce(pl.lat, v.lat), 'lng', coalesce(pl.lng, v.lng),
                                            'name', coalesce(pl.name, v.auto_name)) order by v.arrived_at)
        from visits v left join places pl on pl.id = v.place_id
        where v.user_id = p_user and v.arrived_at < d_to and coalesce(v.departed_at, now()) > d_from), '[]'::jsonb),
      'route', coalesce((
        select jsonb_agg(jsonb_build_array(round(lat::numeric, 6), round(lng::numeric, 6), at) order by at)
        from (
          select lat, lng, at, row_number() over (order by at) as n, count(*) over () as total
          from points where user_id = p_user and at >= d_from and at < d_to and coalesce(accuracy_m, 0) <= 65
        ) t where (n - 1) % greatest(1, ceil(total / 1500.0)::int) = 0), '[]'::jsonb));
  end if;
  return out;
end $$;
