-- The home screen's own memo + sections (subcategories) on the home screen, like the ones inside a
-- category. Paste into Supabase → SQL Editor → Run (once).

-- The short line under "Home" (one row).
create table if not exists home_settings (
  id          int primary key default 1 check (id = 1),
  description text
);
insert into home_settings (id) values (1) on conflict (id) do nothing;
alter table home_settings enable row level security;

-- Sections on the home screen ("School", "Me"…). Categories can sit in one, or in none (shown first).
create table if not exists home_category_sections (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  position   int not null default 0,
  created_at timestamptz not null default now()
);
alter table home_category_sections enable row level security;

-- Which section a category is in (deleting a section moves its categories back to "no section").
alter table home_categories add column if not exists section_id uuid references home_category_sections (id) on delete set null;
