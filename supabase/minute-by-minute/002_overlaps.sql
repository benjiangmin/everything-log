-- Minute by Minute: entries may now overlap (e.g. "Studying" while "Music" runs, or something you
-- add afterwards on top of what was already there). Run after 001_core.sql, in the
-- minute-by-minute project: SQL Editor → paste → Run. Safe to run again.

-- No more "one line, no overlaps" rule.
alter table blocks drop constraint if exists blocks_no_overlap;

-- Save an entry as given (new if p_id is empty, otherwise that one). Nothing else is touched;
-- stopping what's running is its own step (stop_running below).
create or replace function place_block(
  p_start timestamptz,
  p_end timestamptz,
  p_activity_id uuid,
  p_note text default null,
  p_source text default 'manual',
  p_confirmed boolean default true,
  p_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := p_id;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if p_start is null then raise exception 'A start time is needed'; end if;
  if p_end is not null and p_end <= p_start then raise exception 'The end has to be after the start'; end if;
  if p_id is null then
    insert into blocks (user_id, started_at, ended_at, activity_id, note, source, confirmed)
      values (v_uid, p_start, p_end, p_activity_id, nullif(btrim(p_note), ''), p_source, p_confirmed)
      returning id into v_id;
  else
    update blocks
      set started_at = p_start, ended_at = p_end, activity_id = p_activity_id,
          note = nullif(btrim(p_note), ''), source = p_source, confirmed = p_confirmed, updated_at = now()
      where id = p_id and user_id = v_uid;
    if not found then raise exception 'That entry is gone'; end if;
  end if;
  return v_id;
end $$;

-- Stop everything that's running, at p_at (or right now, for any that began after p_at).
-- Returns how many were stopped.
create or replace function stop_running(p_at timestamptz default now())
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  update blocks
    set ended_at = case when started_at < p_at then p_at else now() end, updated_at = now()
    where user_id = auth.uid() and ended_at is null and started_at < greatest(p_at, now());
  get diagnostics v_count = row_count;
  return v_count;
end $$;
