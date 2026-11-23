import { closestOnOutline, contains, nearOutline } from "./buildings";
import type { RoutePoint, Visit } from "./data";
import { splitLegs, waitSpot, type Dot } from "./legs";

// The day as stops and the trips between them. Every trip starts at a stop and ends at the next
// one (or at a loose end: where the day's first recording began, or where you are now if you
// haven't stopped yet). Dots recorded while you were at a stop are left out (that's GPS jitter,
// not a route). A stretch with no dots is a "missing" piece, drawn dashed.

export type Spot = { lat: number; lng: number };
// A piece of a trip: a stretch the phone recorded (its dots), or a "missing" one it didn't.
// ends: its first / last spot is a stop, not a dot.
export type Piece = { path: Spot[]; missing: boolean; ends?: { from: boolean; to: boolean }; dots?: Dot[] };
export type Trip = {
  key: string;
  fromId: string | null; // the stop it left
  toId: string | null; // the stop it got to
  start: number; // left the stop (or the first dot)
  end: number; // got to the next stop (or the last dot)
  pieces: Piece[];
  looseStart: Spot | null; // no stop before it: a small node where it began
  looseEnd: Spot | null; // no stop after it (yet): a small node where it ends
  pace: number | null; // metres a second over the recorded dots (walking ~1.4, driving 5+)
  waits: { at: Spot; start: number; end: number }[]; // standing at a stop for a ride (a bus stop)
};

// The recording missed a bit when there are no dots for 20 minutes, or it jumps 200 m+ after 3+
// minutes with nothing (you didn't teleport: that part is drawn dashed, not as a straight line).
const GAP = 20 * 60000;
const missed = (a: Spot & { t: number }, b: Spot & { t: number }) => b.t - a.t > GAP || (b.t - a.t > 3 * 60000 && metres(a, b) > 200);
const ms = (s: string) => +new Date(s);
// Two dots further apart than both their accuracies plus highway speed (45 m/s) for the time
// between them: nobody went that way; the phone lost you in between.
const jumped = (a: Spot & { t: number; acc: number | null }, b: Spot & { t: number; acc: number | null }) =>
  metres(a, b) > (a.acc ?? 0) + (b.acc ?? 0) + Math.max(1, (b.t - a.t) / 1000) * 45;
const spot = (s: { lat: number; lng: number }): Spot => ({ lat: s.lat, lng: s.lng });

// The angle at a (degrees) between the directions to b and to c.
function angleAt(a: Spot, b: Spot, c: Spot) {
  const k = Math.cos((a.lat * Math.PI) / 180);
  const v1 = { x: (b.lng - a.lng) * k, y: b.lat - a.lat };
  const v2 = { x: (c.lng - a.lng) * k, y: c.lat - a.lat };
  const l = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  return l ? (Math.acos(Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / l))) * 180) / Math.PI : 0;
}

// Metres between two spots (good enough at city scale).
export function metres(a: Spot, b: Spot) {
  const k = Math.PI / 180;
  const x = (b.lng - a.lng) * k * Math.cos(((a.lat + b.lat) / 2) * k);
  const y = (b.lat - a.lat) * k;
  return Math.sqrt(x * x + y * y) * 6371000;
}

// Dots worth drawing: everything the phone kept (it already throws out inaccurate ones), minus
//   - fuzzy standing-still dots (±25 m or worse, not moving): the GPS wandering while you stand
//     somewhere (waiting to cross, between tall buildings), drawn as little spikes off the route;
//   - lone spikes: a dot far off between two that are close together (the GPS glitching, not you
//     going somewhere and straight back).
function cleanDots(points: RoutePoint[]) {
  const all = points
    .map((p) => ({
      ...spot(p),
      t: ms(p.at),
      speed: p.speed_mps ?? null,
      acc: p.accuracy_m ?? null,
      still: p.speed_mps != null && p.speed_mps < 0.8,
      fuzzy: p.speed_mps != null && p.speed_mps < 0.5 && (p.accuracy_m ?? 0) > 25,
    }))
    .sort((a, b) => a.t - b.t);
  // Standing somewhere (waiting to cross, talking): one dot, not a zigzag of jitter. A still dot
  // within 20 m of the last one kept is dropped, and a vague one (said still, poor accuracy).
  // Unless it's clearly somewhere else: further from the last dot kept than both their accuracies
  // together. Then it moved, whatever its speed says (when the phone loses the GPS in a car, its
  // stand-in readings all say 0 mph while they creep along the road you're on: on Nov 22 they
  // were the only record of University Ave west of Farley, and dropping them left a gap that
  // filled-in directions looped through).
  const pts: typeof all = [];
  for (const p of all) {
    const prev = pts[pts.length - 1];
    const moved = !!prev && metres(prev, p) > (prev.acc ?? 0) + (p.acc ?? 0);
    if (p.fuzzy && !moved) continue;
    if (prev && p.still && !moved && metres(prev, p) < 20) continue;
    pts.push(moved && p.still ? { ...p, still: false, fuzzy: false } : p);
  }
  return pts.filter((b, i) => {
    const a = pts[i - 1];
    const c = pts[i + 1];
    return !(a && c && metres(a, b) > 150 && metres(b, c) > 150 && metres(a, c) < 100);
  });
}

function pace(dots: (Spot & { t: number })[]) {
  if (dots.length < 2) return null;
  let m = 0;
  for (let i = 1; i < dots.length; i++) m += metres(dots[i - 1], dots[i]);
  const s = (dots[dots.length - 1].t - dots[0].t) / 1000;
  return s > 0 ? m / s : null;
}

export function buildTrips(visits: Visit[], points: RoutePoint[]): Trip[] {
  const vs = [...visits].sort((a, b) => ms(a.arrived_at) - ms(b.arrived_at));
  const pts = cleanDots(points);

  // When you left each stop. iOS sometimes never says; then it's the first dot well away from it
  // (before the next stop), or the next stop's arrival.
  const left = vs.map((v, i) => {
    if (v.departed_at) return ms(v.departed_at);
    const next = vs[i + 1];
    if (!next) return null; // still there
    const nextAt = ms(next.arrived_at);
    const away = pts.find((p) => p.t > ms(v.arrived_at) && p.t < nextAt && metres(p, v) > 100);
    return away ? away.t : nextAt;
  });

  const trips: Trip[] = [];
  // Where you went into each stop (the last dot before it), so you leave the same way.
  const door = new Map<string, Spot>();
  for (let i = -1; i < vs.length; i++) {
    const from = i >= 0 ? vs[i] : null;
    const to = vs[i + 1] ?? null;
    const lo = from ? left[i] : -Infinity;
    if (lo === null) continue; // still at the last stop
    const said = to ? ms(to.arrived_at) : Infinity;
    if (said <= lo) continue;
    // The phone sometimes says you've arrived while you're still a block away (walking up the
    // street to home), and that you left only once you're well down the road. Those dots are the
    // walk, not the stop: the trip runs until the first dot that's really at the next stop, and
    // from the last one really at this one. (Up to 15 minutes either way; good dots only.)
    const atStop = (q: (typeof pts)[number], s: Visit) => nearOutline(s.outline, q.lat, q.lng) || metres(q, s) <= 60 || (s.gps != null && metres(q, s.gps) <= 60);
    const good = (q: (typeof pts)[number]) => q.acc == null || q.acc <= 40;
    let hi = said;
    if (to)
      for (const q of pts) {
        if (q.t <= said) continue;
        if (q.t > said + 15 * 60_000 || (to.departed_at && q.t >= ms(to.departed_at)) || atStop(q, to)) break;
        if (good(q)) hi = q.t;
      }
    let start = lo;
    if (from && lo > -Infinity)
      for (let k = pts.length - 1; k >= 0; k--) {
        const q = pts[k];
        if (q.t >= lo) continue;
        if (q.t < lo - 15 * 60_000 || q.t <= ms(from.arrived_at) || atStop(q, from)) break;
        if (good(q)) start = q.t;
      }
    const inside = pts.filter((p) => p.t >= start && p.t <= hi);
    // Dots right by the stop at either end are you still in (or around) the building, not the
    // trip: the trip starts and ends at the stop's node instead. That's dots within 30 m, or
    // standing-still ones within 75 m (GPS drifting around inside). Dots you were walking on stay,
    // even close to the stop: on a short trip (Theory → SAC, 250 m) they're most of the route.
    // A stop drawn at your place's pin: also by where the phone put you (you may have gone in a
    // door 50 m from the pin).
    // A stop in a building: anything in (or right by) the building is you inside it.
    const near = (p: Spot, s: Visit, m: number) => metres(p, s) <= m || (s.gps != null && metres(p, s.gps) <= m);
    const byStop = (p: (typeof inside)[number], s: Visit) => nearOutline(s.outline, p.lat, p.lng) || near(p, s, 30) || (p.still && near(p, s, 75));
    while (from && inside.length && byStop(inside[0], from)) inside.shift();
    while (to && inside.length && byStop(inside[inside.length - 1], to)) inside.pop();
    if (!inside.length && !(from && to)) continue;
    if (!inside.length && from && to && metres(from, to) < 60) continue; // back to the same place

    // Runs of dots with no long gaps, and no jumps no one could make (2 km in 3 seconds: the
    // phone had lost you, and the dots before it were its stale guesses). Either way the bit in
    // between is drawn as missed (dashed, along the streets), never as a straight line.
    const runs: (typeof inside)[] = [];
    for (const p of inside) {
      const run = runs[runs.length - 1];
      if (!run || missed(run[run.length - 1], p) || jumped(run[run.length - 1], p)) runs.push([p]);
      else run.push(p);
    }
    // A single dot cut off from the rest of the trip is too little to trust: leave it out (but
    // never all of them).
    if (runs.length > 1) for (let r = runs.length - 1; r >= 0; r--) if (runs[r].length === 1 && runs.length > 1) runs.splice(r, 1);
    if (!runs.length && !(from && to)) continue;
    const dots = runs.flat(); // what's left to draw

    const pieces: Piece[] = [];
    if (!runs.length) {
      pieces.push({ path: [spot(from!), spot(to!)], missing: true });
    } else {
      const first = runs[0][0];
      const lastRun = runs[runs.length - 1];
      const last = lastRun[lastRun.length - 1];
      const joinsFrom = from && !missed({ ...spot(from), t: start }, first); // the dots pick up right after leaving
      const joinsTo = to && !missed(last, { ...spot(to), t: hi }); // …and run right up to the next stop
      if (from && !joinsFrom) pieces.push({ path: [spot(from), spot(first)], missing: true });
      runs.forEach((run, r) => {
        if (r > 0) {
          const prev = runs[r - 1];
          pieces.push({ path: [spot(prev[prev.length - 1]), spot(run[0])], missing: true });
        }
        const path = run.map(spot);
        if (r === 0 && joinsFrom) {
          const edge = wall(from!, first);
          if (edge) {
            // In a building: from its wall where your dots head off (the door you used), not from
            // its pin (SAC's is on its north side; it only has a west door).
            path.unshift(edge);
          } else {
            // You usually leave a building the way you came in: start from that door, but only when
            // the way you headed off is on that side (the door no further from your first dot than
            // the stop is, and within 60° of it). Otherwise straight from the stop: one clean line
            // inside the building, never a zigzag through it.
            const d = door.get(from!.id);
            if (d && metres(d, first) > 10 && metres(d, first) <= metres(from!, first) && angleAt(from!, d, first) <= 60) path.unshift(d);
            path.unshift(spot(from!));
          }
        }
        // Into a building: to its wall where your last dot is (the door you went in by), not round
        // to its pin.
        if (r === runs.length - 1 && joinsTo) path.push(wall(to!, last) ?? spot(to!));
        pieces.push({ path, missing: false, ends: { from: r === 0 && !!joinsFrom, to: r === runs.length - 1 && !!joinsTo }, dots: run });
      });
      if (to && !joinsTo) pieces.push({ path: [spot(last), spot(to)], missing: true });
      if (to && joinsTo) door.set(to.id, spot(last));
    }

    const kept = pieces.filter((p) => p.path.length >= 2);
    if (!kept.length) continue;
    // A loose bit that never really goes anywhere (a few dots of GPS drift, or wandering around
    // the stop it's attached to) isn't a trip.
    if (!from || !to) {
      const anchor = from ?? to;
      const reach = anchor ? Math.max(...dots.map((p) => metres(p, anchor))) : Math.max(...dots.map((p) => metres(p, dots[0])));
      if (reach < (anchor ? 100 : 150)) continue;
    }
    trips.push({
      key: `${from?.id ?? "start"}-${to?.id ?? "end"}`,
      fromId: from?.id ?? null,
      toId: to?.id ?? null,
      start: from ? lo : dots[0].t,
      end: to ? said : dots[dots.length - 1].t, // (its times stay the stops'; only its line takes in the walk-up dots)
      pieces: kept,
      pace: pace(dots),
      waits: kept.flatMap((p) => (p.dots ? splitLegs(p.dots).filter((l) => l.mode === "wait").map((l) => ({ at: waitSpot(l), start: l.start, end: l.end })) : [])),
      looseStart: from ? null : spot(dots[0]),
      looseEnd: to ? null : spot(dots[dots.length - 1]),
    });
  }
  return trips;
}

// Where a trip meets a stop that's in a building: the point of its wall closest to your dot
// (the door side). Null when the stop has no building, or the dot's already inside it.
function wall(stop: Visit, dot: Spot): Spot | null {
  const o = stop.outline;
  if (!o || o.length < 3 || contains(o, dot.lat, dot.lng)) return null;
  const [lat, lng] = closestOnOutline(o, dot.lat, dot.lng);
  return { lat, lng };
}

// An encoded polyline → spots (Google: precision 5; Valhalla: 6).
export function decodePolyline(encoded: string, precision = 5): Spot[] {
  const f = 10 ** precision;
  const out: Spot[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && i < encoded.length + 1);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < encoded.length) {
    lat += next();
    lng += next();
    out.push({ lat: lat / f, lng: lng / f });
  }
  return out;
}

// Your entries win: a trip's times give way to what you logged. If you stopped a job a minute
// after the phone says you left (you were still finishing up), the trip starts when the job
// ended; if you started one before the phone noticed you'd arrived, the trip ends then. Same as
// the day bar, so hovering a route lights up exactly its Commute.
//
// And the automatic Commute: the server times it from your dots (when you really left), and the
// phone's own stop times can be far off (Nov 22: the app wasn't running from 4:14 to 4:43, so the
// phone said you left home at 4:14; the Commute said 4:39). Where the trip has no dots of its own
// before the Commute starts (or after it ends), the trip is the Commute's times, so hovering a
// route says the same as the bar and lights up exactly its Commute.
export function fitToEntries(trips: Trip[], blocks: { started_at: string; ended_at: string | null; source: string }[], now = Date.now()): Trip[] {
  const span = (b: { started_at: string; ended_at: string | null }) => ({ start: +new Date(b.started_at), end: b.ended_at ? +new Date(b.ended_at) : now });
  const mine = blocks.filter((b) => b.source !== "location").map(span);
  const auto = blocks.filter((b) => b.source === "location").map(span);
  return trips.map((t) => {
    let start = t.start;
    let end = t.end;
    for (const b of mine) {
      if (b.start < start && b.end > start && b.end < end) start = b.end; // still on your last thing
      if (b.start > start && b.start < end && b.end > end) end = b.start; // already on your next thing
    }
    const over = auto.filter((c) => c.end > start && c.start < end);
    if (over.length) {
      const dots = t.pieces.flatMap((p) => p.dots ?? []);
      const first = Math.min(...over.map((c) => c.start));
      const last = Math.max(...over.map((c) => c.end));
      if (first > start && !dots.some((d) => d.t < first)) start = first;
      if (last < end && !dots.some((d) => d.t > last)) end = last;
    }
    return start === t.start && end === t.end ? t : { ...t, start, end };
  });
}

// Back-to-back stops in the same building, with nothing between them that left it (the GPS
// jumping around while you sat inside made the phone think you'd gone and come back): one stop.
// "Left it": a dot outside the building and further from both stops than twice its own accuracy.
export function joinSameBuilding(visits: Visit[], points: RoutePoint[]): Visit[] {
  const vs = [...visits].sort((a, b) => ms(a.arrived_at) - ms(b.arrived_at));
  const inOutline = (o: Visit["outline"], q: { lat: number; lng: number }) => !!o && o.length >= 3 && contains(o, q.lat, q.lng);
  const sameBuilding = (a: Visit, b: Visit) =>
    (!!a.placeId && a.placeId === b.placeId) ||
    inOutline(a.outline, b) ||
    (!!b.gps && inOutline(a.outline, b.gps)) ||
    inOutline(b.outline, a) ||
    (!!a.gps && inOutline(b.outline, a.gps)) ||
    (!a.placeId && !b.placeId && !!a.auto_name && a.auto_name === b.auto_name);
  const out: (Visit & { len: number })[] = [];
  for (const v of vs) {
    const len = v.departed_at ? ms(v.departed_at) - ms(v.arrived_at) : 1e12; // (still there: the longest)
    const prev = out[out.length - 1];
    if (prev && prev.departed_at && sameBuilding(prev, v)) {
      const from = ms(prev.departed_at);
      const to = ms(v.arrived_at);
      const near = (q: RoutePoint, s: Visit) => {
        const acc = q.accuracy_m ?? 20;
        return metres(q, s) <= 2 * acc || (!!s.gps && metres(q, s.gps) <= 2 * acc);
      };
      const left = points.some((q) => {
        const t = ms(q.at);
        return t > from && t < to && !inOutline(prev.outline, q) && !inOutline(v.outline, q) && !near(q, prev) && !near(q, v);
      });
      if (!left) {
        // (Drawn where the longer one was: more of the time, more readings.)
        const main = len > prev.len ? v : prev;
        out[out.length - 1] = { ...main, outline: main.outline ?? prev.outline ?? v.outline, arrived_at: prev.arrived_at, departed_at: v.departed_at, len: prev.len + len };
        continue;
      }
    }
    out.push({ ...v, len });
  }
  return out.map((v) => {
    const { len, ...rest } = v;
    void len;
    return rest;
  });
}
