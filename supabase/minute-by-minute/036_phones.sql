-- The phone linked to each account: one at a time. Signing in on a new phone takes over; the old
-- phone notices next time it checks and signs itself out. The website shows a note when there's
-- no phone, or the phone hasn't checked in for a while.
create table if not exists phones (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  device_id text not null,
  name text,
  linked_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
alter table phones enable row level security;
drop policy if exists "own phone" on phones;
create policy "own phone" on phones for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Signing in on a phone: this phone is now the one (replacing any other).
create or replace function link_phone(p_device text, p_name text) returns void
language sql security invoker as $$
  insert into phones (user_id, device_id, name) values (auth.uid(), p_device, left(p_name, 80))
  on conflict (user_id) do update set device_id = excluded.device_id, name = excluded.name, linked_at = now(), last_seen = now();
$$;

-- The phone checking in: 'linked' (and noted as seen), 'none' (no phone yet: it links itself),
-- or 'other' (another phone signed in since: this one signs out).
create or replace function check_phone(p_device text, p_name text) returns text
language plpgsql security invoker as $$
declare v_device text;
begin
  select device_id into v_device from phones where user_id = auth.uid();
  if v_device is null then
    perform link_phone(p_device, p_name);
    return 'linked';
  elsif v_device = p_device then
    update phones set last_seen = now() where user_id = auth.uid();
    return 'linked';
  end if;
  return 'other';
end $$;

-- Signing out on the phone: unlink it (only if it's still the linked one).
create or replace function unlink_phone(p_device text) returns void
language sql security invoker as $$
  delete from phones where user_id = auth.uid() and device_id = p_device;
$$;
