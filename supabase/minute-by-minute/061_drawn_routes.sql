-- Minute by Minute: a route is drawn once. Run after 060. Safe to run again.
-- Each piece of a trip, once the map has worked out its line, is saved here, and from then on
-- every reload, browser and device draws that same line (the first one saved stays). It's only
-- worked out again if the trip's own dots change (a different key).
-- They're also what later trips are drawn from: a new trip between the same two places whose
-- dots fit an earlier line (checked on the map, by the dots' own accuracy) is drawn that way.
create table if not exists drawn_routes (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  key text not null,                    -- the piece: how it's drawn (engine) + its dots
  path jsonb not null,                  -- [[lat, lng], …]
  guess boolean not null default false, -- a dashed guess (the phone missed the way)
  from_place uuid references places on delete set null, -- (a whole trip between two of your places)
  to_place uuid references places on delete set null,
  dots int not null default 0,
  spread_m float8,                      -- how sure the phone was (median accuracy of its dots)
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table drawn_routes enable row level security;
drop policy if exists "own drawn_routes" on drawn_routes;
create policy "own drawn_routes" on drawn_routes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists drawn_routes_places on drawn_routes (user_id, from_place, to_place) where from_place is not null and to_place is not null;
