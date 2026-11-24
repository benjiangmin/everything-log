-- 078: a pin on Stats belongs to the view it was pinned on (Nov 24). Run after 077. Safe to run again.
--
-- Pinning Working out on the week used to pin it on the day, month and year too. Now each pin has
-- a scope (day, week, month or year). Pins from before keep showing everywhere they did (one for
-- each view), so unpin it on the views you don't want it on.

alter table stat_pins add column if not exists scope text not null default 'all';
alter table stat_pins drop constraint if exists stat_pins_pkey;
do $$
begin
  if exists (select 1 from stat_pins where scope = 'all') then
    insert into stat_pins (user_id, name, created_at, scope)
      select p.user_id, p.name, p.created_at, s from stat_pins p cross join unnest(array['day', 'week', 'month', 'year']) s
      where p.scope = 'all';
    delete from stat_pins where scope = 'all';
  end if;
end $$;
alter table stat_pins add primary key (user_id, scope, name);
alter table stat_pins alter column scope drop default;
alter table stat_pins drop constraint if exists stat_pins_scope;
alter table stat_pins add constraint stat_pins_scope check (scope in ('day', 'week', 'month', 'year'));
