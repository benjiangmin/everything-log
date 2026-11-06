import "server-only";
import { mbm } from "./supabase";
import { DEFAULT_TZ, dayRange } from "./time";

export type Activity = { id: string; name: string; color: string; last_used_at: string };
export type Block = {
  id: string;
  started_at: string;
  ended_at: string | null; // null = now
  activity_id: string | null;
  note: string | null;
  source: "manual" | "calendar" | "location" | "health" | "app";
  confirmed: boolean;
  place_id?: string | null; // where it happened, if you said (009_entry_places.sql)
};
// Where you went (from the iPhone app; see supabase/minute-by-minute/005_location.sql).
export type Visit = {
  id: string;
  arrived_at: string;
  departed_at: string | null;
  lat: number;
  lng: number;
  place: string | null; // the name you gave it
  auto_name: string | null; // the name your phone found (e.g. "Noland Hall")
};
export type RoutePoint = { at: string; lat: number; lng: number; accuracy_m?: number | null; motion?: string | null };

export type Day = {
  dayKey: string;
  tz: string;
  start: string;
  end: string;
  blocks: Block[];
  activities: Activity[];
  running: Block[]; // what's going on right now (can be more than one)
  visits: Visit[]; // stops that day
  points: RoutePoint[]; // the route between them
  loadedAt: number; // when the server read it (the live clock starts from here)
};

export const mbmTz = () => process.env.MBM_TIMEZONE || DEFAULT_TZ;

// One day (midnight to midnight): every entry touching it, your activities (most recently used
// first, for the quick picks), and what's running right now.
export async function getDay(dayKey: string): Promise<Day> {
  const tz = mbmTz();
  const { start, end } = dayRange(dayKey, tz);
  const client = await mbm();
  // Rebuild the day from the dots first (stops, Commutes: see 014_rebuild_day.sql), so it's right
  // every time you look. Falls back to the older repair if 014 isn't run yet.
  const rebuilt = await client.rpc("rebuild_day", { p_from: start.toISOString(), p_to: end.toISOString() });
  if (rebuilt.error) await client.rpc("repair_day", { p_from: start.toISOString(), p_to: end.toISOString() });
  const [blocks, activities, running] = await Promise.all([
    client
      .from("blocks")
      .select("*")
      .lt("started_at", end.toISOString())
      .or(`ended_at.is.null,ended_at.gt.${start.toISOString()}`)
      .order("started_at"),
    client.from("activities").select("id, name, color, last_used_at").order("last_used_at", { ascending: false }),
    client.from("blocks").select("id, started_at, ended_at, activity_id, note, source, confirmed").is("ended_at", null).order("started_at"),
  ]);
  // Location: if 005_location.sql hasn't been run yet, the day just has no map data.
  const visitsOn = (cols: string) =>
    client
      .from("visits")
      .select(cols)
      .lt("arrived_at", end.toISOString())
      .or(`departed_at.is.null,departed_at.gt.${start.toISOString()}`)
      .order("arrived_at");
  const [firstVisits, pointRows] = await Promise.all([
    visitsOn("id, arrived_at, departed_at, lat, lng, auto_name, places(name)"),
    client.from("points").select("*").gte("at", start.toISOString()).lt("at", end.toISOString()).order("at").limit(5000),
  ]);
  const visitRows = firstVisits.error ? await visitsOn("id, arrived_at, departed_at, lat, lng, places(name)") : firstVisits; // 006 not run yet
  type VisitRow = Omit<Visit, "place" | "auto_name"> & { auto_name?: string | null; places: { name: string } | { name: string }[] | null };
  const visits: Visit[] = visitRows.error
    ? []
    : (visitRows.data as unknown as VisitRow[]).map(({ places, ...v }) => ({ ...v, auto_name: v.auto_name ?? null, place: (Array.isArray(places) ? places[0]?.name : places?.name) ?? null }));
  const points: RoutePoint[] = pointRows.error ? [] : (pointRows.data as RoutePoint[]);

  const error = blocks.error ?? activities.error ?? running.error;
  if (error) {
    throw new Error(
      /relation .* does not exist|schema cache/i.test(error.message)
        ? "Minute by Minute's tables aren't set up yet: run supabase/minute-by-minute/001_core.sql in the minute-by-minute project."
        : `Couldn't load the day: ${error.message}`,
    );
  }
  return {
    dayKey,
    tz,
    start: start.toISOString(),
    end: end.toISOString(),
    blocks: blocks.data as Block[],
    activities: activities.data as Activity[],
    running: running.data as Block[],
    visits,
    points,
    loadedAt: Date.now(),
  };
}

// For the "What are you doing?" panel: your activities, what's running, and when your last
// finished entry ended ("since last entry").
export type NowInfo = { tz: string; activities: Activity[]; running: Block[]; lastEnd: string | null; loadedAt: number };

export async function getNowInfo(): Promise<NowInfo> {
  const client = await mbm();
  const [activities, running, last] = await Promise.all([
    client.from("activities").select("id, name, color, last_used_at").order("last_used_at", { ascending: false }),
    client.from("blocks").select("id, started_at, ended_at, activity_id, note, source, confirmed").is("ended_at", null).order("started_at"),
    client.from("blocks").select("ended_at").not("ended_at", "is", null).order("ended_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const error = activities.error ?? running.error ?? last.error;
  if (error) throw new Error(error.message);
  return {
    tz: mbmTz(),
    activities: activities.data as Activity[],
    running: running.data as Block[],
    lastEnd: (last.data as { ended_at: string } | null)?.ended_at ?? null,
    loadedAt: Date.now(),
  };
}
