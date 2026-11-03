-- Calisthenics: plans → blocks (per day) → exercises.
-- Paste into Supabase → SQL Editor → Run (once). Safe to run again (it won't duplicate Plan #1).

create table if not exists calisthenics_plans (
  id         uuid primary key default gen_random_uuid(),
  number     integer not null unique,      -- Plan #1, #2… (the highest is the current one)
  name       text,                         -- optional, e.g. "Planche era"
  created_at timestamptz not null default now()
);

create table if not exists calisthenics_blocks (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references calisthenics_plans (id) on delete cascade,
  day        text not null check (day in ('daily', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')),
  title      text not null,                -- "Push"
  duration   text,                         -- "1hr 15min"
  note       text,                         -- "Every other day"
  position   integer not null default 0
);

create table if not exists calisthenics_exercises (
  id         uuid primary key default gen_random_uuid(),
  block_id   uuid not null references calisthenics_blocks (id) on delete cascade,
  name       text not null,                -- "Planche leans"
  sets       text,                         -- "3 x 15s", "2 x fail"
  load       text,                         -- weight / notes: "25lbs", "3"…
  position   integer not null default 0
);

create index if not exists calisthenics_blocks_plan on calisthenics_blocks (plan_id, day, position);
create index if not exists calisthenics_exercises_block on calisthenics_exercises (block_id, position);

alter table calisthenics_plans     enable row level security; -- server-only, like everything else
alter table calisthenics_blocks    enable row level security;
alter table calisthenics_exercises enable row level security;

-- Plan #1, from your document.
insert into calisthenics_plans (id, number) values ('6167b5c2-568c-5bb5-a8bf-3941573b5ac4', 1) on conflict do nothing;

insert into calisthenics_blocks (id, plan_id, day, title, duration, note, position) values ('4ac8e251-f703-527c-9bb5-abcfe311f585', '6167b5c2-568c-5bb5-a8bf-3941573b5ac4', 'daily', 'Handstand', '20min', null, 0) on conflict do nothing;
insert into calisthenics_exercises (id, block_id, name, sets, load, position) values
  ('7f4bace0-eef5-5871-b72e-bd1d2d6b2699', '4ac8e251-f703-527c-9bb5-abcfe311f585', 'Stomach to wall', '3 x 30s', null, 0),
  ('ca5705c3-7e75-50e9-a3a0-fc254ccf1088', '4ac8e251-f703-527c-9bb5-abcfe311f585', 'Toe pulls', '2 x 6', null, 1),
  ('a9aab77a-6279-5039-ac3f-e0a0fb0457fd', '4ac8e251-f703-527c-9bb5-abcfe311f585', 'Scissor hold', '2 x 30s', null, 2),
  ('81ab66e9-876e-56e5-9be9-188d3893ad1f', '4ac8e251-f703-527c-9bb5-abcfe311f585', 'Elevated hold', '2 x 30s', null, 3)
on conflict do nothing;
insert into calisthenics_blocks (id, plan_id, day, title, duration, note, position) values ('22978b13-f8e3-5b05-bf6a-28e3c4576ab0', '6167b5c2-568c-5bb5-a8bf-3941573b5ac4', 'daily', 'Stretch', '15min', 'Every other day', 1) on conflict do nothing;
insert into calisthenics_exercises (id, block_id, name, sets, load, position) values
  ('f24fa7bd-f82c-5308-91b2-42fcaca30601', '22978b13-f8e3-5b05-bf6a-28e3c4576ab0', 'Leg raised lift off thing', null, null, 0),
  ('1d2ce094-1120-5197-8e02-54ebc51f5bdf', '22978b13-f8e3-5b05-bf6a-28e3c4576ab0', 'Wall sit knees thing', null, null, 1),
  ('41d22582-9f1f-58bb-94a5-1a256ee76811', '22978b13-f8e3-5b05-bf6a-28e3c4576ab0', 'Elbow over head kneeling thing', null, null, 2),
  ('d9579aa1-e409-5329-ad33-7d9c8de99461', '22978b13-f8e3-5b05-bf6a-28e3c4576ab0', 'Hip things', null, null, 3)
on conflict do nothing;
insert into calisthenics_blocks (id, plan_id, day, title, duration, note, position) values ('21e9bbac-c81d-5c00-91f4-c905486b899b', '6167b5c2-568c-5bb5-a8bf-3941573b5ac4', 'mon', 'Push', '1hr 15min', null, 2) on conflict do nothing;
insert into calisthenics_exercises (id, block_id, name, sets, load, position) values
  ('d2007d76-f711-5ded-af17-5b9f590d635b', '21e9bbac-c81d-5c00-91f4-c905486b899b', 'Planche leans', '3 x 15s', '3', 0),
  ('d6b61d1f-a6e4-58a8-9377-c845c31ec809', '21e9bbac-c81d-5c00-91f4-c905486b899b', 'Tuck planche', '3 x 15s', '2', 1),
  ('6be9e77f-5010-543f-941d-72ebdbfbb45e', '21e9bbac-c81d-5c00-91f4-c905486b899b', 'Pppu', '3 x 8', null, 2),
  ('dbcd0409-e23a-50d2-9c14-1c114c610842', '21e9bbac-c81d-5c00-91f4-c905486b899b', 'Ring dips', '3 x 8', null, 3),
  ('9a5eb802-a78e-5dd9-93ab-b90a3c4eabdc', '21e9bbac-c81d-5c00-91f4-c905486b899b', 'Pike push ups', '3 x 8', null, 4),
  ('67f75cd2-b123-551a-9366-bdc05ef397dd', '21e9bbac-c81d-5c00-91f4-c905486b899b', 'Cable shoulder raises', '2 x fail', '12lbs', 5),
  ('8efa6048-f941-5d8c-97d1-1fbe394bfb35', '21e9bbac-c81d-5c00-91f4-c905486b899b', 'Run/Cardio (vb?)', '2 mile', null, 6)
on conflict do nothing;
insert into calisthenics_blocks (id, plan_id, day, title, duration, note, position) values ('e3b09e70-20b8-56b5-85b2-f029ab7bae30', '6167b5c2-568c-5bb5-a8bf-3941573b5ac4', 'tue', 'Pull', '1hr 15min', null, 3) on conflict do nothing;
insert into calisthenics_exercises (id, block_id, name, sets, load, position) values
  ('43f9dd52-6985-5c8b-83f0-9f1074e46f8e', 'e3b09e70-20b8-56b5-85b2-f029ab7bae30', 'Tuck lever', '3 x 15s', null, 0),
  ('2f6051f5-cd41-5879-9ee3-8800375aa7a8', 'e3b09e70-20b8-56b5-85b2-f029ab7bae30', 'Explosive pull ups', '5 x 4', null, 1),
  ('f3c9cb87-46c8-5371-ac8f-1eff887d5353', 'e3b09e70-20b8-56b5-85b2-f029ab7bae30', 'Front lever pull ups (band)', '3 x 8', null, 2),
  ('24f6ebd7-e793-5c1d-be66-469900baae40', 'e3b09e70-20b8-56b5-85b2-f029ab7bae30', 'Close grip chin up', '3 x 8', null, 3),
  ('9d7ceb97-fc64-565a-baf9-e3cee60a437d', 'e3b09e70-20b8-56b5-85b2-f029ab7bae30', 'Wide grip pull ups', '3 x 8', null, 4)
on conflict do nothing;
insert into calisthenics_blocks (id, plan_id, day, title, duration, note, position) values ('37e3e3a6-9be3-576d-80bd-e88c6bf5b5a7', '6167b5c2-568c-5bb5-a8bf-3941573b5ac4', 'tue', 'Abs', '20min', null, 4) on conflict do nothing;
insert into calisthenics_exercises (id, block_id, name, sets, load, position) values
  ('74592e2c-d834-50ed-92bc-3d0991ed8240', '37e3e3a6-9be3-576d-80bd-e88c6bf5b5a7', 'Hollow body holds', '3 x 45s', null, 0),
  ('152c4a74-73d6-5a60-91ec-5640203264bc', '37e3e3a6-9be3-576d-80bd-e88c6bf5b5a7', 'L sit hold', '3 x 15s', null, 1),
  ('7e4b9385-520c-5a2b-9449-d91f4707aaa1', '37e3e3a6-9be3-576d-80bd-e88c6bf5b5a7', 'Hanging leg raises', '2 x 15', null, 2),
  ('70d106b6-bebb-5756-aeaa-24172c16f047', '37e3e3a6-9be3-576d-80bd-e88c6bf5b5a7', 'Russian twists', '2 x 45s', null, 3)
on conflict do nothing;
insert into calisthenics_blocks (id, plan_id, day, title, duration, note, position) values ('1b633e55-504b-5021-ac49-2000893e4c7e', '6167b5c2-568c-5bb5-a8bf-3941573b5ac4', 'wed', 'Legs', '1hr 15min', null, 5) on conflict do nothing;
insert into calisthenics_exercises (id, block_id, name, sets, load, position) values
  ('38b3ba96-4e9d-541f-951e-c2a5770a08e2', '1b633e55-504b-5021-ac49-2000893e4c7e', 'Cleans', '4 x 5', null, 0),
  ('ae64f954-ebdf-5fdf-88f8-2acc2519c3b1', '1b633e55-504b-5021-ac49-2000893e4c7e', 'Medicine ball pistol squats', '3 x 8', '25lbs', 1),
  ('7d5da6d9-906f-5cc7-b198-36eb7c7457ec', '1b633e55-504b-5021-ac49-2000893e4c7e', 'Weighted drop jumps', '3 x 6', '30', 2),
  ('ecb533b1-3b6a-52a0-b851-57f4b7cb261c', '1b633e55-504b-5021-ac49-2000893e4c7e', 'On knees (pause) jump', '3 x 6', null, 3),
  ('9653d8df-e840-5723-b19e-cdd00048168e', '1b633e55-504b-5021-ac49-2000893e4c7e', 'Rdls', '3 x 6', '185lbs', 4),
  ('e5593205-10d3-5731-9b9c-2de8b7d401f3', '1b633e55-504b-5021-ac49-2000893e4c7e', 'Split squats', '3 x 8', '145', 5)
on conflict do nothing;
insert into calisthenics_blocks (id, plan_id, day, title, duration, note, position) values ('aedf2ca3-65b0-519d-b9ce-013f7ed87653', '6167b5c2-568c-5bb5-a8bf-3941573b5ac4', 'thu', 'Push', '1hr 15min', null, 6) on conflict do nothing;
insert into calisthenics_exercises (id, block_id, name, sets, load, position) values
  ('3068a3a1-b9d6-5026-96e2-d5f3f6891dce', 'aedf2ca3-65b0-519d-b9ce-013f7ed87653', 'Incline bench', '3 x 6', '135lbs', 0),
  ('d0ff547a-fc5e-57cc-ad40-2cb81f47444a', 'aedf2ca3-65b0-519d-b9ce-013f7ed87653', 'Dips', '3 x 8', '70', 1),
  ('37a2a807-1ed9-55d3-84bb-a6cfa88d22b0', 'aedf2ca3-65b0-519d-b9ce-013f7ed87653', 'Overhead press', '3 x 8', '65lbs', 2),
  ('0f9d959c-2ef0-5ab4-a00a-144eeb260bbc', 'aedf2ca3-65b0-519d-b9ce-013f7ed87653', 'Cable flies', '3 x 10', '22.5lbs', 3),
  ('f5b89bbd-a820-5a91-b59a-695c98b78ed9', 'aedf2ca3-65b0-519d-b9ce-013f7ed87653', 'Lateral raises', '2 x fail', '25lbs', 4)
on conflict do nothing;
insert into calisthenics_blocks (id, plan_id, day, title, duration, note, position) values ('0d074122-6ffd-5b62-a349-834f2e5ff411', '6167b5c2-568c-5bb5-a8bf-3941573b5ac4', 'fri', 'Pull', '1hr 15min', null, 7) on conflict do nothing;
insert into calisthenics_exercises (id, block_id, name, sets, load, position) values
  ('29f44ca4-7ffc-5c0b-88ad-dd754aa7f40e', '0d074122-6ffd-5b62-a349-834f2e5ff411', 'Pull ups', '3 x 6', '25lbs', 0),
  ('3067c228-4f19-56c1-807f-2197613cdddf', '0d074122-6ffd-5b62-a349-834f2e5ff411', 'Barbell rows', '3 x 8', '145lbs', 1),
  ('768ae03e-9f6e-5c04-86bc-7b65defa7e47', '0d074122-6ffd-5b62-a349-834f2e5ff411', 'Seated cable rows', '3 x 8', '130lbs', 2),
  ('ff2abce4-208f-5a2d-b7d8-7a0723b255db', '0d074122-6ffd-5b62-a349-834f2e5ff411', 'Face away bayesian curl (bruh)', '3 x 8', '22lbs', 3),
  ('70dd5c8a-f200-546d-a74c-79eda9ed2de2', '0d074122-6ffd-5b62-a349-834f2e5ff411', 'Cable rear delt fly', '3 x 10', null, 4)
on conflict do nothing;
insert into calisthenics_blocks (id, plan_id, day, title, duration, note, position) values ('8894b7a6-a680-58d0-980b-475bb9521fa2', '6167b5c2-568c-5bb5-a8bf-3941573b5ac4', 'fri', 'Abs', '20min', null, 8) on conflict do nothing;
insert into calisthenics_exercises (id, block_id, name, sets, load, position) values
  ('3583cd38-b6f4-5597-97b4-d06d4ff320ff', '8894b7a6-a680-58d0-980b-475bb9521fa2', 'Hollow body holds', '3 x 45s', null, 0),
  ('6125fdb2-0a88-5d9a-bd24-56b0697b68b3', '8894b7a6-a680-58d0-980b-475bb9521fa2', 'L sit hold', '3 x 15s', null, 1),
  ('923a352c-5eac-5744-8a6d-4fba036dc935', '8894b7a6-a680-58d0-980b-475bb9521fa2', 'Hanging leg raises', '3 x 10', null, 2),
  ('e1e959ad-0721-5907-89ff-3baebe0885f3', '8894b7a6-a680-58d0-980b-475bb9521fa2', 'Russian twists', '3 x 45s', null, 3)
on conflict do nothing;
insert into calisthenics_blocks (id, plan_id, day, title, duration, note, position) values ('7061e524-d8eb-5692-b92f-cc8a16a5d540', '6167b5c2-568c-5bb5-a8bf-3941573b5ac4', 'sat', 'Sprints', '30min', null, 9) on conflict do nothing;
insert into calisthenics_exercises (id, block_id, name, sets, load, position) values
  ('65b83b21-adce-5f63-ac5f-92ff1389ae83', '7061e524-d8eb-5692-b92f-cc8a16a5d540', 'Run dat 400m aagghhhhhhh', null, null, 0),
  ('22401114-74f0-5d1e-860b-e4c7721484f9', '7061e524-d8eb-5692-b92f-cc8a16a5d540', 'Sprints', '4 x 25m', null, 1),
  ('1dd63bf7-7853-568f-ba0a-ca1908d2f258', '7061e524-d8eb-5692-b92f-cc8a16a5d540', 'Sprints', '3 x 50m', null, 2),
  ('1fb3e731-880d-5ecd-8b8a-e8c49a742919', '7061e524-d8eb-5692-b92f-cc8a16a5d540', 'Sprints', '1 x 100m', null, 3)
on conflict do nothing;
