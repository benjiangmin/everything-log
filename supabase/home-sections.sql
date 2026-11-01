-- Category descriptions + subcategories (sections) inside a category.
-- Paste into Supabase → SQL Editor → Run (once).

-- The short line under a category's title (on its own page).
alter table home_categories add column if not exists description text;

-- Sections inside a category ("Breaks", "California"…). Pages can sit in one, or in none (shown first).
create table if not exists home_sections (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references home_categories (id) on delete cascade,
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists home_sections_category_idx on home_sections (category_id, position);
alter table home_sections enable row level security; -- locked to the public, the server uses the secret key

-- Which section a page is in (deleting a section moves its pages back to "no section").
alter table home_items add column if not exists section_id uuid references home_sections (id) on delete set null;
