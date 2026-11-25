import { nearOutline, type Outline } from "./buildings";
import type { Day, Visit } from "./data";

// Today, before the phone has sent the stop you just got to: if your newest dots are standing
// still inside the building of a place you've named (Home!), you're there, shown as a stop at once
// (the day bar's "on the way" turns into "Home!", the map puts you there). Only what's shown: the
// real stop still comes from the phone. Passing through instead, the next moving dot ends it.
export function withArrival(day: Day, now: number): Day {
  const named = day.named ?? [];
  if (!named.length || day.visits.some((v) => !v.departed_at)) return day;
  const left = day.visits.reduce((t, v) => Math.max(t, +new Date(v.departed_at!)), 0);
  const after = day.points.filter((p) => +new Date(p.at) > left);
  const last = after.at(-1);
  if (!last || now - +new Date(last.at) > 10 * 60_000) return day; // (the newest dot is old: can't tell)
  const place = named.find((p) => nearOutline(p.outline, last.lat, last.lng, 0));
  if (!place) return day;
  // The still dots in its building, back from the newest.
  let i = after.length;
  while (i > 0 && after[i - 1].motion === "still" && nearOutline(place.outline, after[i - 1].lat, after[i - 1].lng, 0)) i--;
  const run = after.slice(i);
  if (run.length < 2) return day;
  const pending: Visit = {
    id: `arriving-${place.id}`,
    arrived_at: run[0].at,
    departed_at: null,
    lat: place.lat,
    lng: place.lng,
    place: place.name,
    auto_name: null,
    outline: place.outline,
    placeId: place.id,
    arriving: true,
  };
  return { ...day, visits: [...day.visits, pending] };
}

export type NamedPlace = { id: string; name: string; lat: number; lng: number; outline: Outline };
