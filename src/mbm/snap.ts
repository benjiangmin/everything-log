import { decodePolyline, metres, type Spot } from "./trips";

// Snaps a stretch of GPS dots onto real walkways and roads ("map matching"), so it follows the
// paths you actually took instead of cutting straight across fields. Only stretches the phone
// actually recorded are snapped (gaps it missed stay dashed: never a made-up solid line), and a
// match is used unless it's plainly a different route (far from your dots, or a long detour), so
// walks are snapped every time. Uses Valhalla on the
// OpenStreetMap community's public server (free, no account; it knows campus footpaths).
// Answers are kept in this browser, so each stretch is only sent once. Returns null if it can't
// (offline, server busy, or a match that looks wrong): then the map just draws your dots.
const SERVER = "https://valhalla1.openstreetmap.de/trace_route";
const MAX_POINTS = 300;

export async function snapPath(path: Spot[], pace: number | null): Promise<Spot[] | null> {
  const raw = path.filter((s, i) => i === 0 || s.lat !== path[i - 1].lat || s.lng !== path[i - 1].lng);
  if (raw.length < 3) return null; // (two dots: a straight line is as good as anything)
  let length = 0;
  for (let i = 1; i < raw.length; i++) length += metres(raw[i - 1], raw[i]);
  if (length < 80) return null;

  const step = Math.ceil(raw.length / MAX_POINTS);
  const shape = raw.filter((_, i) => i % step === 0 || i === raw.length - 1);
  const id = `mbm-snap:v4:${shape.length}:${shape[0].lat.toFixed(5)},${shape[0].lng.toFixed(5)}:${shape[shape.length - 1].lat.toFixed(5)},${shape[shape.length - 1].lng.toFixed(5)}`;
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
        costing: (pace ?? 0) > 5 ? "bus" : "pedestrian", // faster than ~18 km/h: a bus (or car; bus lanes allowed)
        shape_match: "map_snap",
        directions_type: "none",
        trace_options: { search_radius: 40, gps_accuracy: 15, breakage_distance: 300, turn_penalty_factor: 500 },
      }),
    });
    if (!res.ok) return remember(id, null, res.status === 400); // 400: it can't match this one, don't ask again
    const body = (await res.json()) as { trip?: { legs?: { shape?: string }[] } };
    const matched = (body.trip?.legs ?? []).flatMap((l) => (l.shape ? decodePolyline(l.shape, 6) : []));
    if (matched.length < 2) return remember(id, null, true);
    // Unless it's plainly not your route: much longer than the dots (a detour), or far from one.
    let len = 0;
    for (let i = 1; i < matched.length; i++) len += metres(matched[i - 1], matched[i]);
    if (len > length * 1.8 + 150) return remember(id, null, true);
    if (raw.some((d) => distanceToPath(d, matched) > 75)) return remember(id, null, true);
    return remember(id, matched, true);
  } catch {
    return null; // offline: try again next time
  }
}

// Metres from a spot to the nearest point on a path (good enough at city scale).
function distanceToPath(p: Spot, path: Spot[]) {
  const k = Math.cos((p.lat * Math.PI) / 180);
  const xy = (s: Spot) => ({ x: (s.lng - p.lng) * k * 111320, y: (s.lat - p.lat) * 110540 });
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = xy(path[i - 1]);
    const b = xy(path[i]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = dx * dx + dy * dy;
    const u = l ? Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / l)) : 0;
    best = Math.min(best, Math.hypot(a.x + u * dx, a.y + u * dy));
  }
  return best;
}

function remember(id: string, path: Spot[] | null, keep: boolean) {
  if (keep) {
    try {
      localStorage.setItem(id, path ? JSON.stringify(path) : "none");
    } catch {}
  }
  return path;
}
