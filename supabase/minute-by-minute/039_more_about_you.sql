-- Minute by Minute: three more things that move life expectancy a lot, for the Future page.
-- Each is optional; left out, nothing is adjusted.
alter table profiles add column if not exists education text
  check (education in ('less_hs', 'hs', 'some_college', 'bachelors'));
alter table profiles add column if not exists smoking text
  check (smoking in ('never', 'former', 'current'));
-- Minutes a week of moderate exercise or more (a brisk walk counts), in the bands studies use.
alter table profiles add column if not exists exercise text
  check (exercise in ('none', 'lt75', '75_149', '150_299', '300_449', '450'));
