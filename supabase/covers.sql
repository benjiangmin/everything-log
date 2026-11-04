-- Covers for Games and Anime (picked from AniList / IGDB when you add one).
-- Paste into Supabase → SQL Editor → Run (once).
alter table games add column if not exists cover_url text;  -- picture of the cover (or empty for your own titles)
alter table games add column if not exists source_id text;  -- which IGDB game it is ("igdb:1942")
alter table anime add column if not exists cover_url text;
alter table anime add column if not exists source_id text;  -- which AniList anime it is ("anilist:16498")
