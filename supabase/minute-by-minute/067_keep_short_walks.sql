-- 067: Keep the Commute for a short walk next door (Nov 23).
-- 066 made a Commute for home → Chipotle (98 m), but tidy_round_trips, which runs right after,
-- treats any two stops within 100 m as a round trip (out and back to the same spot) and removed
-- it. Two different saved places aren't a round trip now. Only tidy_round_trips changes.

create or replace function tidy_round_trips(p_from timestamptz, p_to timestamptz)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  a record;
  v_commute uuid;
  v_went boolean;
begin
  if auth.uid() is null then return; end if;
  select id into v_commute from activities where user_id = auth.uid() and name = 'Commute';
  if v_commute is null then return; end if;
  for a in
    with s as (
      select departed_at, lat, lng, place_id, lead(arrived_at) over w as next_at, lead(lat) over w as nlat, lead(lng) over w as nlng,
             lead(place_id) over w as next_place
      from visits where user_id = auth.uid() and arrived_at < p_to and coalesce(departed_at, 'infinity') > p_from
      window w as (order by arrived_at)
    )
    select departed_at as left_at, next_at, lat, lng from s
    where departed_at is not null and next_at is not null
      and next_at - departed_at between interval '30 seconds' and interval '3 hours'
      and meters_between(lat, lng, nlat, nlng) <= 100
      -- (Two different places next door, like home and the Chipotle across the street, aren't a
      -- round trip: that walk keeps the Commute 066 made for it.)
      and not (place_id is not null and next_place is not null and place_id <> next_place)
  loop
    -- Only automatic Commutes in there, and nothing of yours.
    if not exists (select 1 from blocks where user_id = auth.uid() and activity_id = v_commute and source = 'location'
                   and started_at < a.next_at and coalesce(ended_at, 'infinity') > a.left_at) then
      continue;
    end if;
    if exists (select 1 from blocks where user_id = auth.uid() and started_at < a.next_at and coalesce(ended_at, 'infinity') > a.left_at
               and (activity_id is distinct from v_commute or source <> 'location')) then
      continue;
    end if;
    v_went := exists (select 1 from points p where p.user_id = auth.uid() and p.at > a.left_at and p.at < a.next_at
                      and (p.accuracy_m is null or p.accuracy_m <= 65) and meters_between(p.lat, p.lng, a.lat, a.lng) > 150);
    delete from blocks where user_id = auth.uid() and activity_id = v_commute and source = 'location'
      and started_at < a.next_at and coalesce(ended_at, 'infinity') > a.left_at;
    if v_went then
      insert into blocks (started_at, ended_at, activity_id, source, confirmed) values (a.left_at, a.next_at, v_commute, 'location', true);
    end if;
  end loop;
end $$;
