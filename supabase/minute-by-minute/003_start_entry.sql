-- Minute by Minute: "start something" as one step in the database, so the website and the iPhone
-- app follow exactly the same rules. Run after 002, in the minute-by-minute project.
-- Safe to run again.

-- Find-or-create an activity by name; a new one gets the next color in turn.
create or replace function activity_id_for(p_name text, p_color text default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_name text := btrim(p_name);
  v_palette text[] := array['#7f5539','#b08968','#6b8f71','#5e7b9b','#c08552','#8e6c8a','#a3473a','#4f6d5e','#d4a373','#6d597a','#9c6644','#5f7470'];
begin
  if v_name is null or v_name = '' then return null; end if;
  select id into v_id from activities where user_id = auth.uid() and lower(btrim(name)) = lower(v_name);
  if v_id is null then
    insert into activities (name, color)
      values (v_name, coalesce(p_color, v_palette[(select count(*) from activities where user_id = auth.uid()) % array_length(v_palette, 1) + 1]))
      returning id into v_id;
  else
    update activities set last_used_at = now() where id = v_id;
  end if;
  return v_id;
end $$;

-- Start something.
--   p_since:  'last' = when your last finished entry ended (switching: now), 'now', or a moment.
--   p_switch: true = stop what's running first (the Switch button); false = run alongside (+ Start).
-- Switching again within a minute fixes that last one instead of leaving a sliver.
create or replace function start_entry(p_name text, p_since text default 'last', p_switch boolean default false)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := now();i 
  v_uid uuid := auth.uid();
  v_act uuid;
  v_start timestamptz;
  v_running integer;
  v_last timestamptz;
  v_fresh uuid;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  v_act := activity_id_for(left(regexp_replace(btrim(p_name), '\s+', ' ', 'g'), 60));
  if v_act is null then raise exception 'What are you doing?'; end if;

  select count(*) into v_running from blocks where user_id = v_uid and ended_at is null;
  select max(ended_at) into v_last from blocks where user_id = v_uid and ended_at is not null and ended_at <= v_now;

  if p_since = 'now' then
    v_start := v_now;
  elsif p_since = 'last' then
    v_start := case when p_switch and v_running > 0 then v_now else coalesce(v_last, v_now) end;
  else
    v_start := least(p_since::timestamptz, v_now);
  end if;

  if p_switch and v_running = 1 and v_start >= v_now - interval '1 second' then
    select id into v_fresh from blocks where user_id = v_uid and ended_at is null and started_at > v_now - interval '1 minute';
    if v_fresh is not null then
      update blocks set activity_id = v_act, updated_at = v_now where id = v_fresh;
      return v_fresh;
    end if;
  end if;

  if p_switch and v_running > 0 then
    perform stop_running(v_start);
  end if;
  return place_block(v_start, null, v_act);
end $$;
