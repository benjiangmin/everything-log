-- Minute by Minute: no stuck "you're still here" stop after setting an entry's place.
-- Run after 056. Safe to run again.
-- Setting an entry's place (Working on this project → Home!) splits the phone's stop around the
-- entry, and kept a copy of the rest of it ("after the entry, back where the phone said"). When
-- the phone was still in that stop, the copy had no end, and since it wasn't the phone's own
-- stop, the phone could never end it: the map kept showing you there (the Book Store) even
-- after the phone had moved on to Theory. Now that copy isn't made for a stop the phone is still
-- in (the phone's own stop carries on), and any stuck ones are cleared up below.

create or replace function set_entry_place(p_block_id uuid, p_place_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  b blocks%rowtype;
  p places%rowtype;
  v visits%rowtype;
  v_s timestamptz;
  v_e timestamptz;   -- end of the overlap ('infinity' = still going)
  v_dep timestamptz; -- the stop's own end ('infinity' = still there)
  v_bend timestamptz;
  v_min constant interval := interval '10 minutes'; -- shorter leftovers aren't real stops
  v_here uuid;
  v_sliver timestamptz;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into b from blocks where id = p_block_id and user_id = auth.uid();
  if b.id is null then raise exception 'That entry is gone'; end if;
  update blocks set place_id = p_place_id, updated_at = now() where id = b.id;
  if p_place_id is null then return; end if;
  select * into p from places where id = p_place_id and user_id = auth.uid();
  if p.id is null then raise exception 'That place is gone'; end if;
  v_bend := coalesce(b.ended_at, 'infinity');

  for v in
    select * from visits
    where user_id = auth.uid() and arrived_at < v_bend and coalesce(departed_at, 'infinity') > b.started_at
      and place_id is distinct from p.id
    order by arrived_at
  loop
    v_s := greatest(v.arrived_at, b.started_at);
    v_dep := coalesce(v.departed_at, 'infinity');
    v_e := least(v_dep, v_bend);
    if v_s - v.arrived_at > v_min then
      -- Before: the stop keeps its start and place, ending when the entry began.
      update visits set departed_at = v_s where id = v.id;
      insert into visits (arrived_at, departed_at, lat, lng, place_id)
        values (v_s, nullif(v_e, 'infinity'), p.lat, p.lng, p.id)
        on conflict (user_id, arrived_at) do nothing;
    else
      -- It starts with the entry: this stop becomes the "during" part.
      update visits set departed_at = nullif(v_e, 'infinity'), lat = p.lat, lng = p.lng, place_id = p.id, auto_name = null
        where id = v.id;
    end if;
    -- (057: not for a stop the phone is still in. That copy was never the phone's, so the phone
    -- could never end it: it stayed "here" forever, e.g. at the Book Store after you'd gone home.)
    if v_dep > v_e and not (v_dep = 'infinity' and v.lk_id is not null) and (v_dep = 'infinity' or v_dep - v_e > v_min) then
      -- After: back where the phone said, until it said you left.
      insert into visits (arrived_at, departed_at, lat, lng, accuracy_m, place_id, auto_name)
        values (v_e, nullif(v_dep, 'infinity'), v.lat, v.lng, v.accuracy_m, v.place_id, v.auto_name)
        on conflict (user_id, arrived_at) do nothing;
    end if;
  end loop;

  -- A leftover sliver somewhere else right before/after (from an earlier split): fold it in.
  select id into v_here from visits
    where user_id = auth.uid() and place_id = p.id and arrived_at < v_bend and coalesce(departed_at, 'infinity') > b.started_at
    order by arrived_at limit 1;
  if v_here is not null then
    with gone as (
      delete from visits
        where user_id = auth.uid() and place_id is distinct from p.id and departed_at is not null
          and departed_at between b.started_at - interval '1 minute' and b.started_at + interval '1 minute'
          and departed_at - arrived_at < v_min
        returning arrived_at
    )
    select min(arrived_at) into v_sliver from gone;
    if v_sliver is not null then
      update visits set arrived_at = least(arrived_at, v_sliver) where id = v_here;
    end if;
  end if;

  -- A stop there that's shorter than the entry (the phone only caught part of it): stretch it to
  -- cover the entry, as long as that doesn't run into another stop.
  if v_here is not null then
    begin
      update visits w set
          arrived_at = least(w.arrived_at, b.started_at),
          departed_at = case when w.departed_at is null or b.ended_at is null then w.departed_at else greatest(w.departed_at, b.ended_at) end
        where w.id = v_here
          and not exists (
            select 1 from visits o
            where o.user_id = auth.uid() and o.id <> w.id
              and o.arrived_at < coalesce(case when w.departed_at is null or b.ended_at is null then w.departed_at else greatest(w.departed_at, b.ended_at) end, 'infinity')
              and coalesce(o.departed_at, 'infinity') > least(w.arrived_at, b.started_at)
          );
    exception when unique_violation then null;
    end;
  end if;

  -- No stop there at all (the phone missed it): add one for the entry's time.
  if not exists (
    select 1 from visits where user_id = auth.uid() and place_id = p.id
      and arrived_at < v_bend and coalesce(departed_at, 'infinity') > b.started_at
  ) then
    insert into visits (arrived_at, departed_at, lat, lng, place_id)
      values (b.started_at, b.ended_at, p.lat, p.lng, p.id)
      on conflict (user_id, arrived_at) do update set lat = excluded.lat, lng = excluded.lng, place_id = excluded.place_id,
        departed_at = excluded.departed_at, auto_name = null;
  end if;
end $$;

-- Clear up stuck ones: open stops that aren't the phone's own, from before a stop the phone
-- started later (so the phone has clearly moved on since).
delete from visits v
where v.departed_at is null and v.lk_id is null and coalesce(v.source, '') <> 'locokit'
  and exists (select 1 from visits n where n.user_id = v.user_id and n.source = 'locokit' and n.arrived_at > v.arrived_at);
