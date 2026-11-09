-- Minute by Minute: look up stops' buildings again. Run after 021, in the minute-by-minute
-- project. Safe to run again.
--
-- The first lookups got "busy" answers from the map server, which were taken as "not in a
-- building". Stops with no building are checked again the next time you open their day.
update visits set outline_checked = false where outline is null;
