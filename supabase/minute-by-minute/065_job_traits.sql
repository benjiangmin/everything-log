-- Minute by Minute: suggestions that understand what a job is (AI). Run once; safe to run again.
--
-- activities.traits: what the AI read from a job's name, once (again only if you rename it):
--   { "kind": "routine" | "occasional" | "one_off",   -- "Ate lunch with Josh and Allen": one_off
--     "months": [11] | null,                          -- "Thanksgiving banquet": November only
--     "place": "Abby's house" | null,                 -- only makes sense there
--     "people": true | false,                         -- about specific people
--     "about": "eating at Chipotle" }                 -- a few words on what it is
-- Suggestions leave out one-offs, jobs out of season, and jobs tied to a place you're not at.
alter table activities add column if not exists traits jsonb;
alter table activities add column if not exists traits_name text; -- (the name they were read from)

-- Which of your jobs fits a place (by its name: "Chipotle Mexican Grill" → Grabbing Chipotle),
-- or none. Worked out once per place name, again when you've added jobs since.
create table if not exists place_job_matches (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  label text not null,
  activity_id uuid references activities on delete cascade,
  made_at timestamptz not null default now(),
  primary key (user_id, label)
);
alter table place_job_matches enable row level security;
drop policy if exists "own place_job_matches" on place_job_matches;
create policy "own place_job_matches" on place_job_matches for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
