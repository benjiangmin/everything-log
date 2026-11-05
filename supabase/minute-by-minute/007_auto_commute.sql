-- Minute by Minute: Commute fills itself in. Run after 006, in the minute-by-minute project.
-- Safe to run again.
--
--   You leave a stop  → whatever's running stops, and "Commute" starts at the moment you left.
--   You arrive        → that automatic Commute stops at the moment you arrived. What you do next
--                       is up to you (start something, or it stays untracked).
-- Only for recent trips (the last 3 hours), so a late upload of old stops never rewrites the past.

create or replace function record_visit(
  p_arrived timestamptz,
  p_departed timestamptz,
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_was_departed timestamptz;
  v_commute uuid;
  v_recent timestamptz := now() - interval '3 hours';
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select id, departed_at into v_id, v_was_departed from visits
    where user_id = auth.uid() and arrived_at between p_arrived - interval '2 minutes' and p_arrived + interval '2 minutes'
    order by abs(extract(epoch from arrived_at - p_arrived)) limit 1;

  if v_id is null then
    -- A new stop: you've arrived somewhere.
    insert into visits (arrived_at, departed_at, lat, lng, accuracy_m, place_id)
      values (p_arrived, p_departed, p_lat, p_lng, p_accuracy, place_at(p_lat, p_lng))
      returning id into v_id;
    if p_arrived > v_recent then
      v_commute := activity_id_for('Commute');
      update blocks
        set ended_at = greatest(p_arrived, started_at + interval '1 minute'), updated_at = now()
        where user_id = auth.uid() and ended_at is null and source = 'location' and activity_id = v_commute
          and started_at < p_arrived;
    end if;
  else
    update visits set departed_at = coalesce(p_departed, departed_at) where id = v_id;
  end if;

  -- You've just left this stop (the first time we hear about it): Commute starts.
  if p_departed is not null and v_was_departed is null and p_departed > v_recent
     and not exists (select 1 from visits where user_id = auth.uid() and arrived_at > p_departed) then
    v_commute := coalesce(v_commute, activity_id_for('Commute'));
    perform stop_running(p_departed);
    perform place_block(p_departed, null, v_commute, null, 'location', true);
  end if;
  return v_id;
end $$;
