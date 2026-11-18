-- Minute by Minute: your account page. A profile picture (kept small, right in your row), and
-- two ways out: clear everything you've recorded (keep the account), or delete the account
-- itself (everything goes with it: every table is tied to it "on delete cascade").
alter table profiles add column if not exists avatar text check (length(avatar) <= 120000); -- a small JPEG, as a data: URL

-- Everything you've recorded, gone; your account (and sign-in) stays.
create or replace function delete_my_data() returns void
language plpgsql security invoker set search_path = public as $$
declare t text;
begin
  if auth.uid() is null then return; end if;
  foreach t in array array['blocks', 'visits', 'points', 'phone_use', 'day_locks', 'stat_pins', 'route_reports',
                           'suggestion_dismissals', 'dismissed', 'calendar_events', 'google_accounts', 'lk_removed',
                           'places', 'activities', 'phones', 'profiles'] loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from public.%I where user_id = auth.uid()', t);
    end if;
  end loop;
end $$;

-- Your account, gone for good (and with it, everything above). Only ever your own.
create or replace function delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;
