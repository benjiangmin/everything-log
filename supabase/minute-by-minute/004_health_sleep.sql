-- Minute by Minute: sleep from Apple Health (your Apple Watch), sent by the iPhone app.
-- Run after 003, in the minute-by-minute project. Safe to run again.
--
-- The app sends the nights it found for a window of days (e.g. the last week). This replaces the
-- automatic "Sleep" entries in that window with those nights, so running it again never makes
-- duplicates, and nights grow as the Watch adds data. Sleep you entered or changed yourself is
-- never touched (editing one makes it yours), and an automatic night that overlaps one of yours
-- is skipped.
create or replace function sync_health_sleep(p_from timestamptz, p_to timestamptz, p_nights jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sleep uuid;
  v_night jsonb;
  v_start timestamptz;
  v_end timestamptz;
  v_added integer := 0;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  v_sleep := activity_id_for('Sleep');

  delete from blocks
    where user_id = v_uid and source = 'health' and activity_id = v_sleep
      and started_at >= p_from and started_at < p_to;

  for v_night in select * from jsonb_array_elements(coalesce(p_nights, '[]'::jsonb)) loop
    v_start := (v_night->>'start')::timestamptz;
    v_end := (v_night->>'end')::timestamptz;
    continue when v_start is null or v_end is null or v_end <= v_start or v_start < p_from or v_start >= p_to;
    continue when exists (
      select 1 from blocks
      where user_id = v_uid and activity_id = v_sleep and source <> 'health'
        and tstzrange(started_at, coalesce(ended_at, 'infinity'::timestamptz)) && tstzrange(v_start, v_end)
    );
    perform place_block(v_start, v_end, v_sleep, null, 'health', true);
    v_added := v_added + 1;
  end loop;
  return v_added;
end $$;
