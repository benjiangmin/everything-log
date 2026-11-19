import type { mbm } from "./supabase";

// Calendar events and your own plans (calendar_events), for the Plan tab and the Day bar.
export type PlanEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  place_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  started_block?: string | null; // (043) it's become an entry
  skipped?: boolean; // (043) you said skip
};

type Client = Awaited<ReturnType<typeof mbm>>;

// Events overlapping start–end (041's place columns, if it's been run).
export async function eventsBetween(client: Client, start: Date, end: Date): Promise<PlanEvent[]> {
  const q = (cols: string) => client.from("calendar_events").select(cols).lt("starts_at", end.toISOString()).gt("ends_at", start.toISOString()).order("starts_at");
  let r = await q("id, title, starts_at, ends_at, all_day, location, place_id, lat, lng, started_block, skipped");
  if (r.error) r = await q("id, title, starts_at, ends_at, all_day, location, place_id, lat, lng");
  if (r.error) r = await q("id, title, starts_at, ends_at, all_day, location");
  return (r.data ?? []) as unknown as PlanEvent[];
}

// A plan with no spot of its own, whose location names one of your places ("Theory", "Theory
// Madison, 1 W ..."): it's there.
export function placeFor(e: PlanEvent, places: { name: string; lat: number; lng: number }[]): { lat: number; lng: number } | null {
  if (e.lat != null && e.lng != null) return { lat: e.lat, lng: e.lng };
  const loc = e.location?.trim().toLowerCase();
  if (!loc) return null;
  const hit =
    places.find((p) => p.name.toLowerCase() === loc) ??
    places
      .filter((p) => p.name.length >= 3 && (loc.startsWith(p.name.toLowerCase()) || loc.split(",")[0].trim() === p.name.toLowerCase()))
      .sort((a, b) => b.name.length - a.name.length)[0];
  return hit ? { lat: hit.lat, lng: hit.lng } : null;
}
