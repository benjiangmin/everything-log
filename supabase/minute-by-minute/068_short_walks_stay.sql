-- 068: Short walks stay, and leaving a stop leaves no gap (Nov 23).
-- 1. A Commute under a minute (home → Chipotle, 47 seconds) was made by 066, then removed by the
--    cleanup that runs when your entries change: it drops automatic slivers under a minute left
--    from cutting around your entries. A Commute that is a whole trip (it starts when you left a
--    stop and ends when you got to the next) isn't a sliver: it stays now.
-- 2. Walking out of class: leaving the stop ended THEATRE120 at 12:55:13; the phone later moved
--    the departure to 12:55:29 and the Commute followed, but the class didn't, leaving 16 seconds
--    untracked. Now an entry you started at a stop that ends up to 2 minutes before that trip's
--    Commute (with nothing in between) ends where the Commute starts. Today's class too, on the
--    phone's next send.
-- make_room_for_yours (from 044) and rebuild_day (from 066) change; nothing else.

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
  -- (Slivers left over from cutting around your entries go. A whole short trip doesn't: a
  -- Commute that starts when you left one stop and ends when you got to the next, like a
  -- 47-second walk next door.)
  delete from blocks b
    where b.user_id = auth.uid() and b.source = 'location' and b.ended_at is not null and b.ended_at - b.started_at < v_min
      and b.started_at < p_to and b.ended_at > p_from
      and not (exists (select 1 from visits v where v.user_id = auth.uid() and v.departed_at between b.started_at - interval '2 seconds' and b.started_at + interval '2 seconds')
           and exists (select 1 from visits n where n.user_id = auth.uid() and n.arrived_at between b.ended_at - interval '2 seconds' and b.ended_at + interval '2 seconds'));
end $$;

create or replace function rebuild_day(p_from timestamptz, p_to timestamptz)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  r record;
  c_lat double precision;
  c_lng double precision;
  c_n integer := 0;
  c_at timestamptz[];
  c_sp double precision[];
  b record;
  v_end timestamptz;
  v_commute uuid;
  a record;
  st record;
  have_prev boolean := false;
  pv_e timestamptz;
  pv_lat double precision;
  pv_lng double precision;
  pv_n integer;
  v_lk_since timestamptz;
  v_pieces integer;
  v_start timestamptz;
  v_dist double precision;
  v_dots integer;
begin
  if auth.uid() is null then return; end if;
  perform set_config('mbm.rebuilding', '1', true); -- (so blocks_keep_yours knows these changes are automatic)
  select min(arrived_at) into v_lk_since from visits where user_id = auth.uid() and source = 'locokit';

  if v_lk_since is not null and p_to > v_lk_since then
    -- LocoKit days. An older stop still "open" from before LocoKit: you left it at the first dot
    -- well away from it (so the trip to the next stop gets its Commute and its route), or else
    -- when the next stop began. Also fixes one that was closed at the next stop before.
    update visits v set departed_at = greatest(v.arrived_at, least(
        (select min(n.arrived_at) from visits n where n.user_id = auth.uid() and n.arrived_at > v.arrived_at),
        (select min(p.at) from points p where p.user_id = auth.uid() and p.at > v.arrived_at
           and p.at < coalesce((select min(n.arrived_at) from visits n where n.user_id = auth.uid() and n.arrived_at > v.arrived_at), 'infinity')
           and meters_between(p.lat, p.lng, v.lat, v.lng) > 150)))
      where v.user_id = auth.uid() and v.source <> 'locokit' and v.arrived_at < p_to
        and coalesce(v.departed_at, 'infinity') > p_from - interval '1 day'
        and exists (select 1 from visits n where n.user_id = auth.uid() and n.source = 'locokit' and n.arrived_at > v.arrived_at)
        and (v.departed_at is null or v.departed_at = (
          select min(n.arrived_at) from visits n where n.user_id = auth.uid() and n.arrived_at > v.arrived_at));
  else
  create temp table if not exists _stays (s timestamptz, e timestamptz, lat double precision, lng double precision, n integer) on commit drop;
  truncate _stays;

  -- 1–2: walk the clean dots in order, grouping them into stays.
  for r in
    with d as (
      select at, lat, lng, speed_mps,
             lag(lat) over w as plat, lag(lng) over w as plng, lead(lat) over w as nlat, lead(lng) over w as nlng
      from points
      where user_id = auth.uid() and at >= p_from - interval '3 hours' and at < p_to
        and (accuracy_m is null or accuracy_m <= 65)
      window w as (order by at)
    )
    select at, lat, lng, speed_mps from d
    where not (plat is not null and nlat is not null
               and meters_between(plat, plng, lat, lng) > 150 and meters_between(lat, lng, nlat, nlng) > 150
               and meters_between(plat, plng, nlat, nlng) < 100)
    order by at
  loop
    if c_n > 0 and meters_between(r.lat, r.lng, c_lat, c_lng) <= 75 then
      c_lat := (c_lat * c_n + r.lat) / (c_n + 1);
      c_lng := (c_lng * c_n + r.lng) / (c_n + 1);
      c_n := c_n + 1;
      c_at := c_at || r.at;
      c_sp := c_sp || r.speed_mps;
      continue;
    end if;
    if c_n > 0 then
      b := stay_bounds(c_at, c_sp);
      v_end := coalesce(b.dep, greatest(c_at[c_n], r.at - make_interval(secs => meters_between(c_lat, c_lng, r.lat, r.lng) / greatest(coalesce(r.speed_mps, 1.4), 1.0))));
      if v_end - b.arr >= interval '5 minutes' then
        insert into _stays values (b.arr, v_end, c_lat, c_lng, c_n);
      end if;
    end if;
    c_lat := r.lat; c_lng := r.lng; c_n := 1; c_at := array[r.at]; c_sp := array[r.speed_mps];
  end loop;
  if c_n > 0 then
    b := stay_bounds(c_at, c_sp);
    if now() - c_at[c_n] < interval '2 hours' and b.dep is null and least(now(), p_to) - b.arr >= interval '5 minutes' then
      insert into _stays values (b.arr, null, c_lat, c_lng, c_n);
    elsif coalesce(b.dep, c_at[c_n]) - b.arr >= interval '5 minutes' then
      insert into _stays values (b.arr, coalesce(b.dep, c_at[c_n]), c_lat, c_lng, c_n);
    end if;
  end if;

  -- 3: the stops, fixed to match each stay.
  for st in select * from _stays order by s loop
    perform apply_stay(st.s, st.e, st.lat, st.lng, st.n);
  end loop;
  for st in select * from _stays order by s loop
    if have_prev and pv_e is not null and st.s > pv_e and st.n >= 2 and pv_n >= 2
       and meters_between(pv_lat, pv_lng, st.lat, st.lng) > 100 then
      update visits set departed_at = pv_e
        where user_id = auth.uid() and meters_between(lat, lng, pv_lat, pv_lng) <= 150
          and departed_at > pv_e and departed_at <= st.s and arrived_at < pv_e;
      begin
        update visits set arrived_at = st.s
          where user_id = auth.uid() and meters_between(lat, lng, st.lat, st.lng) <= 150
            and arrived_at >= pv_e and arrived_at < st.s and coalesce(departed_at, 'infinity') > st.s;
      exception when unique_violation then null;
      end;
    end if;
    have_prev := true;
    pv_e := st.e; pv_lat := st.lat; pv_lng := st.lng; pv_n := st.n;
  end loop;

  -- 3b
  perform close_open_stops(p_to);
  end if;

  -- 4: a Commute for each trip between two stops (somewhere else, within 3 hours).
  v_commute := activity_id_for('Commute');
  for a in
    with s as (
      select id, arrived_at, departed_at, lat, lng, source, place_id,
             lead(arrived_at) over w as next_at, lead(lat) over w as next_lat, lead(lng) over w as next_lng,
             lead(source) over w as next_source, lead(place_id) over w as next_place
      from visits where user_id = auth.uid() and arrived_at < p_to and coalesce(departed_at, 'infinity') > p_from - interval '3 hours'
      window w as (order by arrived_at)
    )
    select departed_at as left_at, next_at, source = 'locokit' and next_source = 'locokit' as lk,
           meters_between(lat, lng, next_lat, next_lng) as dist from s
    where departed_at is not null and next_at is not null
      and next_at - departed_at between interval '30 seconds' and interval '3 hours'
      and (meters_between(lat, lng, next_lat, next_lng) > 100
           -- Next door (under 100 m apart, like home to the Chipotle across the street): still a
           -- trip when they're two different places and the phone saw you walking between them.
           or (place_id is not null and next_place is not null and place_id <> next_place
               and (select count(*) from points p where p.user_id = auth.uid()
                      and p.at > departed_at and p.at < next_at and p.speed_mps >= 0.8) >= 3))
  loop
    if exists (select 1 from dismissed where user_id = auth.uid() and started_at < a.next_at and ended_at > a.left_at) then
      continue;
    end if;
    -- LocoKit: a trip whose Commute got cut in pieces (by a stop LocoKit has since taken back) is
    -- one Commute again. Only automatic pieces, and only if there's nothing of yours in between.
    if a.lk then
      select count(*) into v_pieces from blocks
        where user_id = auth.uid() and activity_id = v_commute and source = 'location'
          and started_at < a.next_at and coalesce(ended_at, 'infinity') > a.left_at;
      if v_pieces >= 2 and not exists (
        select 1 from blocks where user_id = auth.uid() and started_at < a.next_at and coalesce(ended_at, 'infinity') > a.left_at
          and (activity_id is distinct from v_commute or source <> 'location')
      ) then
        delete from blocks where user_id = auth.uid() and activity_id = v_commute and source = 'location'
          and started_at < a.next_at and coalesce(ended_at, 'infinity') > a.left_at;
      end if;
    end if;
    -- When did the trip really start? If the phone has the trip's dots, when you left. If it
    -- missed the trip (no dots: the app wasn't running), the stop "ends" at its last dot, which
    -- can be long before you actually left: then the Commute is only as long as the trip takes
    -- (walking, or a bus for far ones), ending when you got there. The time before stays
    -- untracked, for you to fill in.
    v_start := a.left_at;
    if v_lk_since is not null and a.left_at >= v_lk_since then
      select count(*) into v_dots from points
        where user_id = auth.uid() and at > a.left_at and at < a.next_at and (accuracy_m is null or accuracy_m <= 65);
      if v_dots < 3 then
        v_dist := a.dist * 1.35; -- streets aren't straight
        v_start := greatest(a.left_at, a.next_at - make_interval(secs => greatest(120, v_dist / case when v_dist > 2500 then 5.0 else 1.3 end)));
        -- One made before this was added, covering the whole gap: shortened to match.
        update blocks set started_at = v_start, updated_at = now()
          where user_id = auth.uid() and activity_id = v_commute and source = 'location'
            and started_at >= a.left_at - interval '1 second' and started_at < v_start - interval '1 minute'
            and ended_at > v_start and ended_at <= a.next_at + interval '1 second';
      end if;
    end if;
    -- LocoKit trip with one automatic Commute for it (that you haven't moved), and nothing of
    -- yours in the way: it follows the stops' times as LocoKit fixes them, so the bar and the map agree.
    if a.lk then
      update blocks fit set started_at = v_start, ended_at = a.next_at, updated_at = now()
        where fit.user_id = auth.uid() and fit.activity_id = v_commute and fit.source = 'location' and fit.auto_fit
          and fit.started_at < a.next_at and coalesce(fit.ended_at, 'infinity') > a.left_at
          and (abs(extract(epoch from fit.started_at - v_start)) > 20 or abs(extract(epoch from coalesce(fit.ended_at, now()) - a.next_at)) > 20)
          and (select count(*) from blocks cc where cc.user_id = auth.uid() and cc.activity_id = v_commute
                 and cc.started_at < a.next_at and coalesce(cc.ended_at, 'infinity') > a.left_at) = 1
          and not exists (select 1 from blocks yo where yo.user_id = auth.uid() and yo.id <> fit.id
                 and yo.started_at < a.next_at and coalesce(yo.ended_at, 'infinity') > v_start and yo.source <> 'location');
    end if;
    if exists (
      select 1 from blocks where user_id = auth.uid() and activity_id = v_commute
        and started_at < a.next_at and coalesce(ended_at, 'infinity') > v_start
    ) then continue; end if;
    update blocks set ended_at = v_start, updated_at = now()
      where user_id = auth.uid() and ended_at is null and started_at < v_start and activity_id is distinct from v_commute;
    insert into blocks (started_at, ended_at, activity_id, source, confirmed, auto_fit)
      values (v_start, a.next_at, v_commute, 'location', true, true);
  end loop;

  -- An entry you started at a stop and that leaving ended (at the phone's first idea of when you
  -- left) follows when the phone settles on a slightly later departure: it ends where that trip's
  -- Commute starts, so no sliver of untracked time sits between them. Only up to 2 minutes, and
  -- only with nothing else in between: one you stopped yourself well before leaving keeps its time.
  update blocks y set ended_at = c.started_at, updated_at = now()
    from visits v, blocks c
    where v.user_id = auth.uid() and v.source = 'locokit' and v.departed_at is not null
      and v.departed_at > p_from - interval '3 hours' and v.departed_at < p_to
      and c.user_id = auth.uid() and c.activity_id = v_commute and c.source = 'location'
      and c.started_at between v.departed_at - interval '2 seconds' and v.departed_at + interval '2 seconds'
      and y.user_id = auth.uid() and y.id <> c.id and y.source <> 'location' and y.activity_id is distinct from v_commute
      and y.started_at >= v.arrived_at - interval '2 minutes'
      and y.ended_at >= c.started_at - interval '2 minutes' and y.ended_at < c.started_at
      and not exists (select 1 from blocks z where z.user_id = auth.uid() and z.id not in (y.id, c.id)
                        and z.started_at < c.started_at and coalesce(z.ended_at, 'infinity') > y.ended_at);

  -- No automatic Commute runs through a stop.
  for a in
    select arrived_at, departed_at from visits
    where user_id = auth.uid() and departed_at is not null and arrived_at < p_to and departed_at > p_from - interval '3 hours'
  loop
    perform split_commute_at_stop(a.arrived_at, a.departed_at);
  end loop;
  perform set_config('mbm.rebuilding', '', true);
end $$;

