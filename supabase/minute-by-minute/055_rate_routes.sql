-- Minute by Minute: rate a route (1-5 stars, and a note). Run after 054. Safe to run again.
-- Clicking a trip on the map → its stars. They're saved with the line the map drew and the dots
-- it came from (like "Route looks wrong" before: 029). A route you gave 4 or 5 stars is trusted:
-- the next trip between the same two places is drawn that way, but only if its own dots fit
-- that line (checked in the app, by the dots' own accuracy). 1-2 stars: a test case for fixing
-- how routes are drawn, never reused.
alter table route_reports add column if not exists stars smallint check (stars between 1 and 5);
-- The places at either end when you rated it (a stop's id changes; its place doesn't).
alter table route_reports add column if not exists from_place uuid references places on delete set null;
alter table route_reports add column if not exists to_place uuid references places on delete set null;
create index if not exists route_reports_trusted on route_reports (user_id, from_place, to_place) where stars >= 4;

-- Trusted routes between the places of these two stops, either way round (reversed: drawn the
-- other way, from p_to to p_from). Newest first. Each comes with how sure the phone was when it
-- was recorded (the median accuracy of its dots), for the fit check.
create or replace function trusted_routes(p_from uuid, p_to uuid)
returns table (drawn jsonb, reversed boolean, spread_m float8)
language sql
stable
security invoker
set search_path = public
as $$
  with ends as (
    select (select place_id from visits where id = p_from and user_id = auth.uid()) as a,
           (select place_id from visits where id = p_to and user_id = auth.uid()) as b
  )
  select r.drawn, r.from_place = e.b,
         (select percentile_cont(0.5) within group (order by (d->>3)::float8)
            from jsonb_array_elements(r.dots) d where d->>3 is not null)
  from route_reports r, ends e
  where r.user_id = auth.uid() and r.stars >= 4 and e.a is not null and e.b is not null and e.a <> e.b
    and ((r.from_place = e.a and r.to_place = e.b) or (r.from_place = e.b and r.to_place = e.a))
  order by r.created_at desc
  limit 10;
$$;
