-- Minute by Minute: your trails, learned from where you've walked. Run after 027, in the
-- minute-by-minute project. Safe to run again.
--
-- Every walk you've recorded, boiled down to a grid of small squares (~6 m): how many times
-- you've been through each one, the middle of your dots in it, and which way the path runs
-- there. The map uses it to pull a new walk's wobbly dots onto the line you usually take, so a
-- route you repeat (out of Theory, up Lake St) comes out the same, clean line, and gets cleaner
-- the more you walk it. Nothing about any city is built in: it's only your own dots.

create index if not exists points_user_at on points (user_id, at);

drop function if exists trail_cells(double precision, double precision, double precision, double precision, timestamptz, integer);
create or replace function trail_cells(
  p_min_lat double precision, p_max_lat double precision,
  p_min_lng double precision, p_max_lng double precision,
  p_before timestamptz,
  p_days integer default 120
)
returns jsonb -- [[lat, lng, n, c2, s2], …] (one value, so it isn't cut off at 1000 rows)
language sql
stable
security invoker
set search_path = public
as $$
  with walk as (
    -- Walking-pace dots the phone was sure about, with the way you were heading (from the dot
    -- before, if it was close in time).
    select p.lat, p.lng,
           lag(p.lat) over w as plat, lag(p.lng) over w as plng, lag(p.at) over w as pat, p.at
    from points p
    where p.user_id = auth.uid() and p.source = 'locokit'
      and p.at < p_before and p.at > p_before - make_interval(days => greatest(1, least(p_days, 730)))
      and p.lat between p_min_lat and p_max_lat and p.lng between p_min_lng and p_max_lng
      and coalesce(p.accuracy_m, 99) <= 20
      and p.speed_mps between 0.6 and 2.6
    window w as (order by p.at)
  ), dir as (
    select lat, lng,
           -- The path's direction, doubled (so there and back count as the same path).
           atan2((lat - plat) * 110540, (lng - plng) * 111320 * cos(radians(lat))) * 2 as a2,
           meters_between(lat, lng, plat, plng) as step
    from walk
    where pat is not null and at - pat < interval '40 seconds'
  ), cell as (
    select floor(lat * 110540 / 6) as gy, floor(lng * 111320 * cos(radians(p_min_lat)) / 6) as gx,
           lat, lng, a2
    from dir
    where step between 2 and 40
  )
  select coalesce(jsonb_agg(jsonb_build_array(round(la::numeric, 7), round(ln::numeric, 7), n, round(c2::numeric, 3), round(s2::numeric, 3))), '[]'::jsonb)
  from (
    select avg(lat) as la, avg(lng) as ln, count(*)::integer as n, avg(cos(a2)) as c2, avg(sin(a2)) as s2
    from cell
    group by gy, gx
    having count(*) >= 2
    limit 30000
  ) t;
$$;
