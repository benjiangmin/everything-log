-- Minute by Minute: the core tables.
-- Run this in the "minute-by-minute" Supabase project (NOT the everything-log one):
-- SQL Editor → paste → Run. Safe to run again.
--
-- The idea: your day is a line of blocks ("Class 9:00–10:15", "Cooking 18:00–18:40"…) that never
-- overlap. The block with no end is what you're doing now; starting something new ends it.
-- Everything is per signed-in user (row level security), so the iPhone app can talk to it
-- directly and nobody else can ever read your data.

create extension if not exists btree_gist; -- lets the "no overlaps" rule below work

-- ---------- What you do: flexible, made as you go ("Work", "Cooking", "Hanging out w/ Leo") ----------
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  color text not null default '#a98467' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);
create unique index if not exists activities_name on activities (user_id, lower(btrim(name)));

-- ---------- The day: blocks of time ----------
create table if not exists blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz, -- empty = going on now
  activity_id uuid references activities on delete set null,
  note text check (length(note) <= 500),
  -- Where it came from: you, a calendar suggestion, your location, Apple Health, app tracking.
  source text not null default 'manual' check (source in ('manual', 'calendar', 'location', 'health', 'app')),
  confirmed boolean not null default true, -- false = a suggestion waiting for a yes
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at > started_at)
);
create index if not exists blocks_by_time on blocks (user_id, started_at);

-- No two blocks may overlap (and so only one can be "now"). Checked at the end of each change,
-- so place_block() below can shuffle neighbours around first.
do $$ begin
  alter table blocks add constraint blocks_no_overlap
    exclude using gist (user_id with =, tstzrange(started_at, coalesce(ended_at, 'infinity'::timestamptz)) with &&)
    deferrable initially immediate;
exception when duplicate_object or duplicate_table then null; end $$;

-- ---------- Only you can see or change your rows ----------
alter table activities enable row level security;
alter table blocks enable row level security;

drop policy if exists "own activities" on activities;
create policy "own activities" on activities for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own blocks" on blocks;
create policy "own blocks" on blocks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Find-or-create an activity by name (any capitalisation). Returns its id. ----------
create or replace function activity_id_for(p_name text, p_color text default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_name text := btrim(p_name);
begin
  if v_name is null or v_name = '' then return null; end if;
  select id into v_id from activities where user_id = auth.uid() and lower(btrim(name)) = lower(v_name);
  if v_id is null then
    insert into activities (name, color) values (v_name, coalesce(p_color, '#a98467')) returning id into v_id;
  else
    update activities set last_used_at = now() where id = v_id;
  end if;
  return v_id;
end $$;

-- ---------- Put a block on the timeline, making room for it ----------
-- New (p_id empty) or moved/edited (p_id given). Anything it lands on gets trimmed, split or
-- removed, so the day stays one clean line. p_end empty = "doing it now" (ends whatever was).
-- Example: "Studying" since 5pm (now), then you add "Cooking 6–7pm" →
--          Studying 5–6, Cooking 6–7, Studying 7–now.
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
  v_end timestamptz := coalesce(p_end, 'infinity'::timestamptz);
  v_id uuid := p_id;
  b record;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if p_start is null then raise exception 'A start time is needed'; end if;
  if p_end is not null and p_end <= p_start then raise exception 'The end has to be after the start'; end if;
  if p_id is not null and not exists (select 1 from blocks where id = p_id and user_id = v_uid) then
    raise exception 'That block is gone';
  end if;

  set constraints blocks_no_overlap deferred;

  for b in
    select * from blocks
    where user_id = v_uid
      and (p_id is null or id <> p_id)
      and tstzrange(started_at, coalesce(ended_at, 'infinity'::timestamptz)) && tstzrange(p_start, v_end)
    order by started_at
  loop
    if b.started_at >= p_start and coalesce(b.ended_at, 'infinity'::timestamptz) <= v_end then
      delete from blocks where id = b.id;                                   -- fully covered
    elsif b.started_at < p_start and coalesce(b.ended_at, 'infinity'::timestamptz) > v_end then
      update blocks set ended_at = p_start, updated_at = now() where id = b.id;  -- split around it:
      insert into blocks (user_id, started_at, ended_at, activity_id, note, source, confirmed)
        values (v_uid, v_end, b.ended_at, b.activity_id, b.note, b.source, b.confirmed);  -- the rest after
    elsif b.started_at < p_start then
      update blocks set ended_at = p_start, updated_at = now() where id = b.id;  -- trim its end
    else
      update blocks set started_at = v_end, updated_at = now() where id = b.id;  -- trim its start
    end if;
  end loop;

  if p_id is null then
    insert into blocks (user_id, started_at, ended_at, activity_id, note, source, confirmed)
      values (v_uid, p_start, p_end, p_activity_id, nullif(btrim(p_note), ''), p_source, p_confirmed)
      returning id into v_id;
  else
    update blocks
      set started_at = p_start, ended_at = p_end, activity_id = p_activity_id,
          note = nullif(btrim(p_note), ''), source = p_source, confirmed = p_confirmed, updated_at = now()
      where id = p_id;
  end if;

  set constraints blocks_no_overlap immediate; -- check now (raises if anything still overlaps)
  return v_id;
end $$;
