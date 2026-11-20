-- Minute by Minute: look again for your places' buildings.
-- A place whose building wasn't found once (OpenStreetMap busy, or its pin on the pavement just
-- outside) was saved as "no building" and never looked up again. The website now looks a little
-- further (45 m) for places: these get one more look, the next time their day is opened.
update places set outline_checked = false where outline is null and outline_checked;
