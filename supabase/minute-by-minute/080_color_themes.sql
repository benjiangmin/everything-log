-- 080: color themes (Nov 24). Run after 079. Safe to run again.
--
-- Pick a theme (Jobs and categories → Color theme) and every category and job takes its colors:
-- the busiest first (the theme's first colors are the most different from each other), reused
-- when there are more jobs than colors. A job in a category shows the category's color, as before.
-- A color you pick yourself stays when the theme changes; "Reset to theme" gives it back. New jobs
-- and categories get the theme's next color.
--
-- Each job and category has a slot (its place in the theme), so switching themes keeps who has
-- which color, just in the new colors.

alter table profiles add column if not exists color_theme text;
alter table profiles add column if not exists theme_colors text[];
alter table activities add column if not exists color_slot int;
alter table activities add column if not exists color_by_hand boolean not null default false;
alter table categories add column if not exists color_slot int;
alter table categories add column if not exists color_by_hand boolean not null default false;

-- Your theme's color for a slot (null: no theme).
create or replace function theme_color(p_slot int)
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select theme_colors[(coalesce(p_slot, 0) % cardinality(theme_colors)) + 1]
  from profiles where user_id = auth.uid() and cardinality(theme_colors) > 0;
$$;

create or replace function next_color_slot()
returns int
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(greatest((select max(color_slot) from activities where user_id = auth.uid()),
                           (select max(color_slot) from categories where user_id = auth.uid())), -1) + 1;
$$;

-- New jobs and categories: the theme's next color (unless you picked one). (Named "a_…" so it runs
-- before the category-color trigger, which then keeps it as the job's own color.)
create or replace function color_from_theme()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.color_slot is null then new.color_slot := next_color_slot(); end if;
  if not new.color_by_hand and theme_color(new.color_slot) is not null then
    new.color := theme_color(new.color_slot);
  end if;
  return new;
end $$;
drop trigger if exists activities_a_theme on activities;
create trigger activities_a_theme before insert on activities for each row execute function color_from_theme();
drop trigger if exists categories_a_theme on categories;
create trigger categories_a_theme before insert on categories for each row execute function color_from_theme();

-- Use a theme. p_reset: your own colors go too (the first time: everything takes the theme).
create or replace function apply_color_theme(p_name text, p_colors text[], p_reset boolean)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  n int;
begin
  if auth.uid() is null then return; end if;
  if cardinality(p_colors) < 3 or cardinality(p_colors) > 24 or exists (select 1 from unnest(p_colors) c where c !~ '^#[0-9a-fA-F]{6}$') then
    raise exception 'That isn''t a theme.';
  end if;
  insert into profiles (user_id, color_theme, theme_colors) values (auth.uid(), left(p_name, 40), p_colors)
    on conflict (user_id) do update set color_theme = excluded.color_theme, theme_colors = excluded.theme_colors;
  if p_reset then
    update activities set color_by_hand = false, own_color = null where user_id = auth.uid() and (color_by_hand or own_color is not null);
    update categories set color_by_hand = false where user_id = auth.uid() and color_by_hand;
  end if;

  -- Slots: categories and jobs not in one, busiest first; then jobs in categories (their color for
  -- if they leave it).
  create temp table if not exists _slots (kind text, id uuid, slot int) on commit drop;
  delete from _slots where true; -- (Supabase refuses a delete without a where)
  with spent as (
    select activity_id, sum(extract(epoch from coalesce(ended_at, now()) - started_at)) as s
    from blocks where user_id = auth.uid() and activity_id is not null group by activity_id
  ), tops as (
    select 'c' as kind, c.id, c.name, coalesce((select sum(sp.s) from activities a join spent sp on sp.activity_id = a.id where a.category_id = c.id), 0) as s
      from categories c where c.user_id = auth.uid()
    union all
    select 'j', a.id, a.name, coalesce(sp.s, 0) from activities a left join spent sp on sp.activity_id = a.id
      where a.user_id = auth.uid() and a.category_id is null
  )
  insert into _slots select kind, id, (row_number() over (order by s desc, lower(name)) - 1)::int from tops;
  select count(*) into n from _slots;
  with spent as (
    select activity_id, sum(extract(epoch from coalesce(ended_at, now()) - started_at)) as s
    from blocks where user_id = auth.uid() and activity_id is not null group by activity_id
  )
  insert into _slots
    select 'j', a.id, (n + row_number() over (order by coalesce(sp.s, 0) desc, lower(a.name)) - 1)::int
    from activities a left join spent sp on sp.activity_id = a.id
    where a.user_id = auth.uid() and a.category_id is not null;

  update categories c set color_slot = s.slot,
         color = case when c.color_by_hand then c.color else p_colors[(s.slot % cardinality(p_colors)) + 1] end
    from _slots s where s.kind = 'c' and s.id = c.id;
  update activities a set color_slot = s.slot,
         color = case when a.color_by_hand then a.color else p_colors[(s.slot % cardinality(p_colors)) + 1] end
    from _slots s where s.kind = 'j' and s.id = a.id and a.category_id is null;
  update activities a set color_slot = s.slot,
         own_color = case when a.color_by_hand then a.own_color else p_colors[(s.slot % cardinality(p_colors)) + 1] end
    from _slots s where s.kind = 'j' and s.id = a.id and a.category_id is not null;
end $$;

-- "Reset to theme": a job or category you colored yourself takes its theme color again.
create or replace function reset_color(p_kind text, p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_slot int;
begin
  if p_kind = 'category' then
    update categories set color_by_hand = false, color_slot = coalesce(color_slot, next_color_slot()) where id = p_id and user_id = auth.uid()
      returning color_slot into v_slot;
    if theme_color(v_slot) is not null then update categories set color = theme_color(v_slot) where id = p_id; end if;
  else
    update activities set color_by_hand = false, color_slot = coalesce(color_slot, next_color_slot()) where id = p_id and user_id = auth.uid()
      returning color_slot into v_slot;
    if theme_color(v_slot) is not null then
      update activities set own_color = case when category_id is null then own_color else theme_color(v_slot) end,
                            color = case when category_id is null then theme_color(v_slot) else color end
        where id = p_id;
    end if;
  end if;
end $$;

grant execute on function apply_color_theme(text, text[], boolean) to authenticated;
grant execute on function reset_color(text, uuid) to authenticated;
