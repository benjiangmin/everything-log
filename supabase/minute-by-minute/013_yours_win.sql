-- Minute by Minute: your entries always win over automatic ones.
-- Run after 012, in the minute-by-minute project. Safe to run again.
--
-- An automatic entry (a Commute from your location) never overlaps a finished entry of yours
-- ("Grabbing Chipotle 12:18–12:25"). Whichever comes first, the automatic one makes room: it's
-- trimmed, split around yours, or removed if yours covers it. Bits under a minute are dropped.
-- Entries of yours can still overlap each other (that's what "+ Start" is for), and one that's
-- still running doesn't push a Commute away (leaving somewhere stops it anyway).

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
    order by started_at
  loop
    for c in
      select id, started_at, ended_at, activity_id, note, confirmed from blocks
      where user_id = auth.uid() and source = 'location'
        and started_at < m.ended_at and coalesce(ended_at, 'infinity') > m.started_at
    loop
      if c.started_at >= m.started_at and coalesce(c.ended_at, 'infinity') <= m.ended_at then
        delete from blocks where id = c.id;                                   -- all under yours
      elsif c.started_at < m.started_at and coalesce(c.ended_at, 'infinity') > m.ended_at then
        -- Yours is in the middle of it: it stops for yours, then carries on after.
        update blocks set ended_at = m.started_at, updated_at = now() where id = c.id;
        insert into blocks (started_at, ended_at, activity_id, note, source, confirmed)
          values (m.ended_at, c.ended_at, c.activity_id, c.note, 'location', c.confirmed);
      elsif c.started_at < m.started_at then
        update blocks set ended_at = m.started_at, updated_at = now() where id = c.id; -- runs into yours
      else
        update blocks set started_at = m.ended_at, updated_at = now() where id = c.id; -- starts inside yours
      end if;
    end loop;
  end loop;
  -- Slivers left over.
  delete from blocks
    where user_id = auth.uid() and source = 'location' and ended_at is not null and ended_at - started_at < v_min
      and started_at < p_to and ended_at > p_from;
end $$;

-- Runs after any entry is added or changed (but not for the changes it makes itself).
create or replace function blocks_make_room()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  perform make_room_for_yours(new.started_at - interval '1 minute', coalesce(new.ended_at, now()) + interval '1 minute');
  return null;
end $$;

drop trigger if exists blocks_make_room on blocks;
create trigger blocks_make_room after insert or update of started_at, ended_at, source on blocks
  for each row execute function blocks_make_room();
