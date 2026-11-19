-- Minute by Minute: a Commute can be tucked under the job around it too (Work, Commute, Work:
-- one Work, the Commute under it). As 044, plus: the Commute becomes yours, so it stays.
-- (The job around it can't be a Commute.)

create or replace function tuck_between(p_block uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  m record;
  b record;
  a record;
begin
  select * into m from blocks where id = p_block and user_id = auth.uid();
  if not found or m.ended_at is null then return false; end if;
  select * into b from blocks where user_id = auth.uid() and id <> m.id and activity_id is not null and source <> 'location'
    and activity_id is distinct from m.activity_id and ended_at between m.started_at - interval '5 minutes' and m.started_at + interval '1 minute'
    order by ended_at desc limit 1;
  if not found then return false; end if;
  select * into a from blocks where user_id = auth.uid() and id not in (m.id, b.id) and activity_id = b.activity_id
    and started_at between m.ended_at - interval '1 minute' and m.ended_at + interval '5 minutes'
    order by started_at limit 1;
  if not found then return false; end if;
  -- An automatic Commute in the middle becomes yours first, so joining the job around it doesn't
  -- push it out (and redrawing the day's Commutes doesn't replace it).
  if m.source = 'location' then
    update blocks set source = 'manual', updated_at = now() where id = m.id;
  end if;
  update blocks set ended_at = a.ended_at, note = coalesce(nullif(concat_ws(' · ', b.note, a.note), ''), null), updated_at = now() where id = b.id;
  delete from blocks where id = a.id;
  return true;
end $$;
