import type { Dot } from "./legs";
import { decodePolyline, metres, type Spot } from "./trips";

// Snaps a stretch of GPS dots onto real walkways and roads ("map matching"), so it follows the
// paths you actually took instead of cutting straight across fields. Only stretches the phone
// actually recorded are snapped (gaps it missed stay dashed: never a made-up solid line), and a
// trip is snapped leg by leg (walk, bike, ride: see legs.ts), each the way that kind of travel
// goes, and your dots win where they disagree with the map. Uses Valhalla on the
// OpenStreetMap community's public server (free, no account; it knows campus footpaths).
// The server's answers are kept in this browser, so each stretch is only sent once.
const SERVER = "https://valhalla1.openstreetmap.de/trace_route";
const MAX_POINTS = 300;

// How each kind of leg is matched (legs.ts): walks prefer footpaths and walkways over the
// street, bikes go by bike, rides go by bus (bus lanes allowed: it's also fine for a car).
const COSTING: Record<"walk" | "bike" | "ride", { costing: string; costing_options?: object }> = {
  walk: { costing: "pedestrian", costing_options: { pedestrian: { walkway_factor: 0.6, sidewalk_factor: 0.9, alley_factor: 2, driveway_factor: 5 } } },
  bike: { costing: "bicycle", costing_options: { bicycle: { bicycle_type: "hybrid", use_roads: 0.4 } } },
  ride: { costing: "bus" },
};

// Snaps one leg's dots onto the paths or roads it most likely followed. The map's paths are the
// starting point (GPS dots are never exactly where you were: near buildings they drift 20-50 m);
// your dots only win where they clearly show a shortcut the map doesn't know. null: draw the
// dots (the server couldn't match it, or the match is plainly some other route).
export async function snapLeg(dots: Dot[], mode: "walk" | "bike" | "ride"): Promise<Spot[] | null> {
  const raw = dots.filter((s, i) => i === 0 || s.lat !== dots[i - 1].lat || s.lng !== dots[i - 1].lng);
  if (raw.length < 3) return null; // (two dots: a straight line is as good as anything)
  let length = 0;
  for (let i = 1; i < raw.length; i++) length += metres(raw[i - 1], raw[i]);
  if (length < 80) return null;
  const step = Math.ceil(raw.length / MAX_POINTS);
  const shape = raw.filter((_, i) => i % step === 0 || i === raw.length - 1);
  const matched = await matchOnce(shape, mode);
  if (!matched) return null;
  return judge(raw, matched, length);
}

// How far off the phone said a dot could be.
const accOf = (d: Dot) => Math.min(50, Math.max(5, d.acc ?? 15));

// Whether (and where) to use the match. Worked out fresh every time from the server's answer, so
// improving these rules never needs the server asked again.
function judge(raw: Dot[], matched: Spot[], length: number): Spot[] | null {
  let len = 0;
  for (let i = 1; i < matched.length; i++) len += metres(matched[i - 1], matched[i]);
  if (len > length * 1.6 + 150) return null; // a long detour: not your route
  const near = raw.map((d) => project(d, matched).dist <= Math.max(25, accOf(d) * 2.5));
  if (near.filter(Boolean).length < raw.length * 0.4) return null; // mostly somewhere else
  return blend(raw, matched, near);
}

// The server's match for a shape, kept in this browser (only its raw answer: the rules above are
// applied each time). Requests go one at a time, a little apart, and are retried when the
// server is busy: the public server turns away bursts, and a turned-away request used to mean
// a day of wobbly lines.
async function matchOnce(shape: Dot[], mode: "walk" | "bike" | "ride"): Promise<Spot[] | null> {
  tidyOldAnswers();
  const id = `mbm-match:v1:${mode}:${hash(shape.map((s) => `${s.lat.toFixed(5)},${s.lng.toFixed(5)}`).join(";"))}`;
  try {
    const kept = localStorage.getItem(id);
    if (kept) return kept === "none" ? null : decodePolyline(kept, 6);
  } catch {}
  const typical = [...shape.map(accOf)].sort((a, b) => a - b)[Math.floor(shape.length / 2)];
  const body = JSON.stringify({
    shape: shape.map((s) => ({ lat: s.lat, lon: s.lng, time: Math.round(s.t / 1000), radius: Math.round(accOf(s) * 2) })),
    ...COSTING[mode],
    shape_match: "map_snap",
    use_timestamps: true,
    directions_type: "none",
    trace_options: { search_radius: Math.round(Math.min(60, typical * 2.5)), gps_accuracy: Math.round(typical), breakage_distance: 400, turn_penalty_factor: 300 },
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    let res: Response;
    try {
      res = await queued(() => fetch(SERVER, { method: "POST", headers: { "Content-Type": "application/json" }, body }));
    } catch {
      return null; // offline: next time
    }
    if (res.ok) {
      const answer = (await res.json().catch(() => ({}))) as { trip?: { legs?: { shape?: string }[] } };
      const shapes = (answer.trip?.legs ?? []).map((l) => l.shape).filter((x): x is string => !!x);
      const matched = shapes.flatMap((x) => decodePolyline(x, 6));
      if (matched.length < 2) return keep(id, null);
      return keep(id, matched);
    }
    if (res.status === 400) return keep(id, null); // it can't match this one: don't ask again
    if (![429, 502, 503, 504].includes(res.status)) return null;
    await sleep(2000 * 2 ** attempt); // busy: wait and try again
  }
  return null;
}

// Older versions kept their (already judged) answers under "mbm-snap:": cleared out once.
let tidied = false;
function tidyOldAnswers() {
  if (tidied) return;
  tidied = true;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith("mbm-snap:")) localStorage.removeItem(k);
    }
  } catch {}
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// One request at a time, at least 1.1 s apart.
let chain: Promise<unknown> = Promise.resolve();
let lastAsk = 0;
function queued<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = lastAsk + 1100 - Date.now();
    if (wait > 0) await sleep(wait);
    lastAsk = Date.now();
    return fn();
  });
  chain = run.catch(() => undefined);
  return run;
}

function keep(id: string, path: Spot[] | null) {
  try {
    localStorage.setItem(id, path ? encodePolyline(path, 6) : "none");
  } catch {}
  return path;
}

function hash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + s.length.toString(36);
}

// Google-style polyline, to keep matches small in this browser's storage.
function encodePolyline(path: Spot[], precision: number) {
  const f = 10 ** precision;
  let out = "";
  let plat = 0;
  let plng = 0;
  const put = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    while (n >= 0x20) {
      out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    out += String.fromCharCode(n + 63);
  };
  for (const p of path) {
    const lat = Math.round(p.lat * f);
    const lng = Math.round(p.lng * f);
    put(lat - plat);
    put(lng - plng);
    plat = lat;
    plng = lng;
  }
  return out;
}

// The match, except where your dots clearly show a shortcut it doesn't know (cutting across a
// lawn, where the map goes the long way round). Compared between where the dots leave the match
// and where they rejoin it. Dots drifting off and back (common near buildings) stay on the match.
function blend(raw: Dot[], matched: Spot[], near: boolean[]): Spot[] {
  const ok = near.map((n, i) => n || (i > 0 && i < near.length - 1 && near[i - 1] && near[i + 1]));
  for (let i = 0; i < raw.length; i++) {
    if (ok[i]) continue;
    let j = i;
    while (j + 1 < raw.length && !ok[j + 1]) j++;
    const before = i - 1;
    const after = j + 1;
    if (before >= 0 && after < raw.length) {
      const a = project(raw[before], matched);
      const b = project(raw[after], matched);
      let dotLen = 0;
      for (let k = before + 1; k <= after; k++) dotLen += metres(raw[k - 1], raw[k]);
      const matchLen = b.along - a.along;
      // Your dots only win for a clear shortcut: a few of them (3+, over 25 s+), sure of
      // themselves (±15 m or better), where the map goes well round (30%+ further). Anything
      // less is the GPS wandering, and the map's path is the better guess.
      const run = raw.slice(i, j + 1);
      const sure = [...run.map(accOf)].sort((x, y) => x - y)[Math.floor(run.length / 2)] <= 15;
      const shortcut = run.length >= 3 && run[run.length - 1].t - run[0].t >= 25_000 && sure && matchLen > dotLen * 1.3 + 25;
      if (!shortcut) for (let k = i; k <= j; k++) ok[k] = true;
    }
    i = j;
  }
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
