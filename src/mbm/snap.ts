import { decodePolyline, metres, type Spot, type Trip } from "./trips";

// Snaps a trip's GPS dots onto real walkways and roads ("map matching"), so it follows the paths
// you actually took instead of cutting straight across fields. Uses Valhalla on the
// OpenStreetMap community's public server (free, no account; it knows campus footpaths). Gaps
// between dots are routed along paths too. Answers are kept in this browser, so each trip is
// only sent once. Returns null if it can't (offline, server busy, or a match that looks wrong);
// then the map just draws your dots.
const SERVER = "https://valhalla1.openstreetmap.de/trace_route";
const MAX_POINTS = 300;

export async function snapTrip(trip: Trip): Promise<Spot[] | null> {
  // The trip's spots in order: the stop it left, the dots, the stop it got to.
  const raw: Spot[] = [];
  for (const p of trip.pieces) for (const s of p.path) {
    const last = raw[raw.length - 1];
    if (!last || last.lat !== s.lat || last.lng !== s.lng) raw.push(s);
  }
  if (raw.length < 2) return null;
  let length = 0;
  for (let i = 1; i < raw.length; i++) length += metres(raw[i - 1], raw[i]);
  if (length < 80) return null;

  const step = Math.ceil(raw.length / MAX_POINTS);
  const shape = raw.filter((_, i) => i % step === 0 || i === raw.length - 1);
  const id = `mbm-snap:v2:${trip.key}:${shape.length}:${shape[0].lat.toFixed(5)},${shape[shape.length - 1].lng.toFixed(5)}`;
  try {
    const kept = localStorage.getItem(id);
    if (kept) return kept === "none" ? null : (JSON.parse(kept) as Spot[]);
  } catch {}

  try {
    const res = await fetch(SERVER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shape: shape.map((s) => ({ lat: s.lat, lon: s.lng })),
        costing: (trip.pace ?? 0) > 5 ? "bus" : "pedestrian", // faster than ~18 km/h: a bus (or car; bus lanes allowed)
        shape_match: "map_snap",
        directions_type: "none",
        trace_options: { search_radius: 35, gps_accuracy: 20, breakage_distance: 3000, turn_penalty_factor: 500 },
      }),
    });
    if (!res.ok) return remember(id, null, res.status === 400); // 400: it can't match this one, don't ask again
    const body = (await res.json()) as { trip?: { legs?: { shape?: string }[] } };
    const path = (body.trip?.legs ?? []).flatMap((l) => (l.shape ? decodePolyline(l.shape, 6) : []));
    if (path.length < 2) return remember(id, null, true);
    // A match much longer than what you walked went somewhere you didn't: don't use it.
    let matched = 0;
    for (let i = 1; i < path.length; i++) matched += metres(path[i - 1], path[i]);
    if (matched > length * 2 + 200) return remember(id, null, true);
    return remember(id, path, true);
  } catch {
    return null; // offline: try again next time
  }
}

function remember(id: string, path: Spot[] | null, keep: boolean) {
  if (keep) {
    try {
      localStorage.setItem(id, path ? JSON.stringify(path) : "none");
    } catch {}
  }
  return path;
}
