-- Moving a stop cleared its place's building but left it marked "already checked", so the
-- building was never looked up again (fixed in the app). This unsticks places it happened to:
-- the map looks their building up again next time you open a day with them.
update places set outline_checked = false where outline is null and outline_checked;
