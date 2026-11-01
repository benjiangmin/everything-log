-- New year's resolutions 2023–2026 from the Google Doc. Run once, after resolutions.sql.
insert into resolutions (year, title, reflection, position) values
  (2023, $r$Stop following the crowd$r$, $r$I think I did pretty good, ended up being pretty lonely.$r$, 0),
  (2023, $r$Stop thinking dirty thoughts…like all the time$r$, $r$Failed 100%$r$, 1),
  (2023, $r$Better hygiene$r$, $r$Yeah, I would say so$r$, 2),
  (2023, $r$Stop judging$r$, $r$I think I did well on this too, just didn’t care about others anymore$r$, 3),
  (2023, $r$Be more chinese, somehow$r$, $r$Maybe, took chinese homework seriously, 666 day duolingo streak, try to only speak chinese with 爸爸？$r$, 4),
  (2023, $r$More consistent exercise$r$, $r$For sure, I took strength, do calisthenics, very excited to continue working on it.$r$, 5),
  (2024, $r$Be nicer to mom and dad$r$, $r$I don't remember how nice I was to them at the beginning of 2024, but I think I am nicer. Not as loving as I can be though. I can do better.$r$, 0),
  (2024, $r$Cease the lusting$r$, $r$Not quite.$r$, 1),
  (2024, $r$Do everything with a purpose, no going through the motions, or doing something just to get it done$r$, $r$I think in terms of lifting, yes. In terms of the bible, not quite, until recently. In terms of school, not quite. I'm disappointed.$r$, 2),
  (2024, $r$Stick to a budget$r$, $r$No…$r$, 3),
  (2024, $r$Learn to cook$r$, $r$I think I cooked a total of like 3 times in 2024. I'm disappointed again.$r$, 4),
  (2024, $r$Actually listen to what pastor steve is saying$r$, $r$Did that for a bit, then stopped.$r$, 5),
  (2024, $r$Get better at CS$r$, $r$Yes, but not nearly as much as I should've and could've.$r$, 6),
  (2024, $r$Be more chinese, somehow$r$, $r$I think I did get better at Chinese…? But culture wise, I think it's a lost cause.$r$, 7),
  (2025, $r$Be nicer to mom and dad$r$, $r$I think this is something that has been solved now. I think it shows by how I felt when reading this resolution, I was like, “fr, I made that resolution? That’s weird, why did I ever think to explicitly make that one a resolution..etc” so nice. I think I did this one.$r$, 0),
  (2025, $r$Cease the lusting (particularly important now)$r$, $r$I did better in some aspects but new forms of lust came in. Now I’m struggling with that.$r$, 1),
  (2025, $r$Do everything with a purpose$r$, $r$I also think I did this well. Workouts saw more progress, I was actually learning in school, I was hearing back from companies, I was meaningfully doing things no matter what it was. I think this one was good.$r$, 2),
  (2025, $r$Stick to a budget$r$, $r$Failed completely.$r$, 3),
  (2025, $r$Learn to cook$r$, $r$I ain’t the best cook out there, but I survived and matter of fact, I’d even say what I made was 85% tasty this semester. So yes, I learned to cook. Lots, lots, lots more room for improvement though.$r$, 4),
  (2025, $r$Make God a priority$r$, $r$My relationship with God surprisingly grew much closer, I think. Double a was actually surprisingly great in regards to this. As well as DOXA. God was made a priority this year, accounting for small group leading and worship and outreach and such. My number 1 priority though? Still working on it.$r$, 5),
  (2026, $r$Decrease screentime$r$, null, 0),
  (2026, $r$Make God #1 priority$r$, null, 1),
  (2026, $r$Be consistent$r$, null, 2),
  (2026, $r$Go plus ultra in everything$r$, null, 3),
  (2026, $r$Manage my time with Abster better$r$, null, 4),
  (2026, $r$Healthy habits when waking up and going to bed$r$, null, 5);

insert into resolution_years (year, note) values
  (2025, $r$I really did horrible last year. Most of 2024 will be here as well.$r$)
on conflict (year) do update set note = excluded.note;
