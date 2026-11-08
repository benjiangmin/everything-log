-- Minute by Minute: when you use your phone, and which app. Run after 017, in the
-- minute-by-minute project. Safe to run again.
--
-- The phone sends stretches of use:
--   - kind 'phone': unlocked → locked (the app hears these itself, while it's running for location)
--   - kind 'app':   an app opened → closed (from a Shortcuts automation, "When <app> is opened/closed")
-- Each has the phone's own id, so sending one again (or with its end, once it has one) updates it.
-- The website shows them on a thin line under the day bar. They're not entries: nothing here
-- moves or trims your entries.

create table if not exists phone_use (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,                 -- the phone's id for it
  kind text not null check (kind in ('phone', 'app')),
  app text,                         -- the app's name (kind 'app')
  started_at timestamptz not null,
  ended_at timestamptz,             -- null: still going
  primary key (user_id, id),
  check (ended_at is null or ended_at >= started_at)
);
create index if not exists phone_use_time on phone_use (user_id, started_at);
alter table phone_use enable row level security;
drop policy if exists "own phone_use" on phone_use;
create policy "own phone_use" on phone_use for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- [{id, kind, app, start, end}]
create or replace function sync_phone_use(p_spans jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  insert into phone_use (id, kind, app, started_at, ended_at)
    select left(e->>'id', 64), e->>'kind', nullif(left(e->>'app', 80), ''), (e->>'start')::timestamptz, (e->>'end')::timestamptz
    from jsonb_array_elements(coalesce(p_spans, '[]')) e
    where e->>'id' is not null and e->>'kind' in ('phone', 'app') and e->>'start' is not null
      and ((e->>'end') is null or (e->>'end')::timestamptz >= (e->>'start')::timestamptz)
  on conflict (user_id, id) do update
    set app = excluded.app, started_at = excluded.started_at, ended_at = excluded.ended_at;
end $$;
