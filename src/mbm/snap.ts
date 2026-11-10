import type { Dot } from "./legs";
import { decodePolyline, metres, type Spot } from "./trips";

// Snaps a stretch of GPS dots onto real walkways and roads ("map matching"), so it follows the
// paths you actually took instead of cutting straight across fields. Only stretches the phone
// actually recorded are snapped (gaps it missed stay dashed: never a made-up solid line), and a
// trip is snapped leg by leg (walk, bike, ride: see legs.ts), each the way that kind of travel
// goes, and your dots win where they disagree with the map. Uses Valhalla on the
// OpenStreetMap community's public server (free, no account; it knows campus footpaths).
// Answers are kept in this browser, so each stretch is only sent once. Returns null if it can't
// (offline, server busy, or a match that looks wrong): then the map just draws your dots.
const SERVER = "https://valhalla1.openstreetmap.de/trace_route";
const MAX_POINTS = 300;

// How each kind of leg is matched (legs.ts): walks prefer footpaths and walkways over the
// street, bikes go by bike, rides go by bus (bus lanes allowed: it's also fine for a car).
const COSTING: Record<"walk" | "bike" | "ride", { costing: string; costing_options?: object }> = {
  walk: { costing: "pedestrian", costing_options: { pedestrian: { walkway_factor: 0.6, sidewalk_factor: 0.9, alley_factor: 2, driveway_factor: 5 } } },
  bike: { costing: "bicycle", costing_options: { bicycle: { bicycle_type: "hybrid", use_roads: 0.4 } } },
  ride: { costing: "bus" },
};

// Snaps one leg's dots onto the paths or roads it most likely followed. Your dots win: a match
// is only used where it agrees with them (most dots close to it, judged by how exact each dot
// was), so a shortcut the map doesn't know, or a match that wandered off, is drawn through your
// dots instead. null: draw the dots.
export async function snapLeg(dots: Dot[], mode: "walk" | "bike" | "ride"): Promise<Spot[] | null> {
  const raw = dots.filter((s, i) => i === 0 || s.lat !== dots[i - 1].lat || s.lng !== dots[i - 1].lng);
  if (raw.length < 3) return null; // (two dots: a straight line is as good as anything)
  let length = 0;
  for (let i = 1; i < raw.length; i++) length += metres(raw[i - 1], raw[i]);
  if (length < 80) return null;

  const step = Math.ceil(raw.length / MAX_POINTS);
  const shape = raw.filter((_, i) => i % step === 0 || i === raw.length - 1);
  const id = `mbm-snap:v6:${mode}:${shape.length}:${shape[0].lat.toFixed(5)},${shape[0].lng.toFixed(5)}:${shape[shape.length - 1].lat.toFixed(5)},${shape[shape.length - 1].lng.toFixed(5)}`;
  try {
    const kept = localStorage.getItem(id);
    if (kept) return kept === "none" ? null : (JSON.parse(kept) as Spot[]);
  } catch {}

  // How far off the phone said each dot could be: tight dots pin the match down, loose ones let
  // it look further.
  const acc = (d: Dot) => Math.min(50, Math.max(5, d.acc ?? 15));
  const typical = [...shape.map(acc)].sort((a, b) => a - b)[Math.floor(shape.length / 2)];
  try {
    const res = await fetch(SERVER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shape: shape.map((s) => ({ lat: s.lat, lon: s.lng, time: Math.round(s.t / 1000), radius: Math.round(acc(s) * 2) })),
        ...COSTING[mode],
        shape_match: "map_snap",
        use_timestamps: true,
        directions_type: "none",
        trace_options: { search_radius: Math.round(Math.min(60, typical * 2.5)), gps_accuracy: Math.round(typical), breakage_distance: 400, turn_penalty_factor: 300 },
      }),
    });
    if (!res.ok) return remember(id, null, res.status === 400); // 400: it can't match this one, don't ask again
    const body = (await res.json()) as { trip?: { legs?: { shape?: string }[] } };
    const matched = (body.trip?.legs ?? []).flatMap((l) => (l.shape ? decodePolyline(l.shape, 6) : []));
    if (matched.length < 2) return remember(id, null, true);
    // Does it agree with your dots? Not a detour (much longer than the dots); then, stretch by
    // stretch: where your dots are close to it (within twice how exact each dot was, at least
    // 20 m) it's the match, and where a run of them is off it (a shortcut the map doesn't know)
    // it's your dots.
    let len = 0;
    for (let i = 1; i < matched.length; i++) len += metres(matched[i - 1], matched[i]);
    if (len > length * 1.5 + 120) return remember(id, null, true);
    const near = raw.map((d) => project(d, matched).dist <= Math.max(20, acc(d) * 2));
    if (near.filter(Boolean).length < raw.length * 0.5) return remember(id, null, true); // mostly elsewhere: your dots
    return remember(id, blend(raw, matched, near), true);
  } catch {
    return null; // offline: try again next time
  }
}

// The match where your dots agree with it, your own dots where they don't. A single dot off the
// match is a GPS wobble (kept on the match); two or more in a row are you going another way.
function blend(raw: Dot[], matched: Spot[], near: boolean[]): Spot[] {
  const ok = near.map((n, i) => n || (i > 0 && i < near.length - 1 && near[i - 1] && near[i + 1]));
  const out: Spot[] = [];
  let i = 0;
  while (i < raw.length) {
    if (!ok[i]) {
      out.push(raw[i]);
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < raw.length && ok[j + 1]) j++;
    // The match between where this run of dots starts and ends on it.
    const a = project(raw[i], matched);
    const b = project(raw[j], matched);
    if (b.along >= a.along) out.push(...slice(matched, a, b));
    else for (let k = i; k <= j; k++) out.push(raw[k]); // (it runs backwards along the match: your dots)
    i = j + 1;
  }
  return out;
}

// Where a spot lands on a path: how far from it, and how far along the path.
function project(p: Spot, path: Spot[]) {
  const k = Math.cos((p.lat * Math.PI) / 180);
  const xy = (s: Spot) => ({ x: (s.lng - p.lng) * k * 111320, y: (s.lat - p.lat) * 110540 });
  let best = { dist: Infinity, along: 0, seg: 0, u: 0 };
  let run = 0;
  for (let i = 1; i < path.length; i++) {
    const a = xy(path[i - 1]);
    const b = xy(path[i]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = dx * dx + dy * dy;
    const u = l ? Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / l)) : 0;
    const d = Math.hypot(a.x + u * dx, a.y + u * dy);
    const segLen = Math.sqrt(l);
    if (d < best.dist) best = { dist: d, along: run + u * segLen, seg: i, u };
    run += segLen;
  }
  return best;
}

// The part of a path between two projected spots.
function slice(path: Spot[], a: ReturnType<typeof project>, b: ReturnType<typeof project>): Spot[] {
  const at = (q: ReturnType<typeof project>): Spot => {
    const p0 = path[q.seg - 1] ?? path[0];
    const p1 = path[q.seg] ?? path[0];
    return { lat: p0.lat + (p1.lat - p0.lat) * q.u, lng: p0.lng + (p1.lng - p0.lng) * q.u };
  };
  return [at(a), ...path.slice(a.seg, b.seg), at(b)];
}

function remember(id: string, path: Spot[] | null, keep: boolean) {
  if (keep) {
    try {
      localStorage.setItem(id, path ? JSON.stringify(path) : "none");
    } catch {}
  }
  return path;
}
