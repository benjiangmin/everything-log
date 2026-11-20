-- Minute by Minute: keep a job going across whatever's between (and undo it).
--   tuck_between  An entry with the same job somewhere before and after it the same day (Work,
--                 Commute, Eating, Commute, Work): the two become one Work, and everything
--                 between goes under it (automatic Commutes become yours, so they stay). (Was:
--                 only right next to each other, 044/045.)
--   lift_out      The other way: an entry under a job comes back up, and the job is cut around it
--                 (and around what's next to it under there, e.g. the Commutes either side).

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
  v_commute uuid;
begin
  select * into m from blocks where id = p_block and user_id = auth.uid();
  if not found or m.ended_at is null then return false; end if;
  select id into v_commute from activities where user_id = auth.uid() and name = 'Commute';
  -- The nearest entry before it whose job comes back after it (within 12 hours): never a Commute.
  for b in
    select * from blocks
    where user_id = auth.uid() and id <> m.id and activity_id is not null and source <> 'location'
      and activity_id is distinct from m.activity_id and activity_id is distinct from v_commute
      and ended_at is not null and ended_at <= m.started_at + interval '1 minute' and ended_at >= m.started_at - interval '12 hours'
    order by ended_at desc
  loop
    select * into a from blocks
      where user_id = auth.uid() and id not in (m.id, b.id) and activity_id = b.activity_id
        and started_at >= m.ended_at - interval '1 minute' and started_at <= b.ended_at + interval '12 hours'
      order by started_at limit 1;
    exit when found;
  end loop;
  if b.id is null or a.id is null then return false; end if;
  -- What's between stays, under it: automatic Commutes become yours (or joining would push them out).
  update blocks set source = 'manual', updated_at = now()
    where user_id = auth.uid() and source = 'location' and started_at < a.started_at and coalesce(ended_at, 'infinity') > b.ended_at;
  update blocks set ended_at = a.ended_at, note = nullif(concat_ws(' · ', b.note, a.note), ''), updated_at = now() where id = b.id;
  delete from blocks where id = a.id;
  return true;
end $$;

create or replace function lift_out(p_block uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  m record;
  w record;
  v_from timestamptz;
  v_to timestamptz;
  nf timestamptz;
  nt timestamptz;
begin
  select * into m from blocks where id = p_block and user_id = auth.uid();
  if not found or m.ended_at is null then return false; end if;
  -- The entry it's under: it covers all of it.
  select * into w from blocks
    where user_id = auth.uid() and id <> m.id and source <> 'location' and activity_id is distinct from m.activity_id
      and started_at < m.started_at and coalesce(ended_at, 'infinity') > m.ended_at
    order by started_at desc limit 1;
  if not found then return false; end if;
  -- …and what's next to it under there (5 minutes apart or less), e.g. the Commutes either side.
  v_from := m.started_at;
  v_to := m.ended_at;
  for i in 1..50 loop
    select least(v_from, coalesce(min(started_at), v_from)), greatest(v_to, coalesce(max(ended_at), v_to)) into nf, nt from blocks
      where user_id = auth.uid() and id <> w.id and ended_at is not null
        and started_at > w.started_at and ended_at < coalesce(w.ended_at, 'infinity')
        and started_at <= v_to + interval '5 minutes' and ended_at >= v_from - interval '5 minutes';
    exit when nf = v_from and nt = v_to;
    v_from := nf;
    v_to := nt;
  end loop;
  -- The job: up to the first of them, and again from the last.
  insert into blocks (started_at, ended_at, activity_id, note, source, confirmed, place_id)
    values (v_to, w.ended_at, w.activity_id, w.note, w.source, w.confirmed, w.place_id);
  update blocks set ended_at = v_from, updated_at = now() where id = w.id;
  return true;
end $$;
