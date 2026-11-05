import type { RoutePoint, Visit } from "./data";

// The day as stops and the trips between them. Every trip starts at a stop and ends at the next
// one (or at a loose end: where the day's first recording began, or where you are now if you
// haven't stopped yet). Dots recorded while you were at a stop are left out (that's GPS jitter,
// not a route). A stretch with no dots is a "missing" piece, drawn dashed.

export type Spot = { lat: number; lng: number };
export type Piece = { path: Spot[]; missing: boolean };
export type Trip = {
  key: string;
  fromId: string | null; // the stop it left
  toId: string | null; // the stop it got to
  start: number; // left the stop (or the first dot)
  end: number; // got to the next stop (or the last dot)
  pieces: Piece[];
  looseStart: Spot | null; // no stop before it: a small node where it began
  looseEnd: Spot | null; // no stop after it (yet): a small node where it ends
};

// The recording missed a bit when there are no dots for 20 minutes, or it jumps 200 m+ after 3+
// minutes with nothing (you didn't teleport: that part is drawn dashed, not as a straight line).
const GAP = 20 * 60000;
const missed = (a: Spot & { t: number }, b: Spot & { t: number }) => b.t - a.t > GAP || (b.t - a.t > 3 * 60000 && metres(a, b) > 200);
const ms = (s: string) => +new Date(s);
const spot = (s: { lat: number; lng: number }): Spot => ({ lat: s.lat, lng: s.lng });

// Metres between two spots (good enough at city scale).
export function metres(a: Spot, b: Spot) {
  const k = Math.PI / 180;
  const x = (b.lng - a.lng) * k * Math.cos(((a.lat + b.lat) / 2) * k);
  const y = (b.lat - a.lat) * k;
  return Math.sqrt(x * x + y * y) * 6371000;
}

// Dots worth drawing: everything the phone kept (it already throws out inaccurate ones), minus
// lone spikes: a dot far off between two that are close together (the GPS glitching, not you
// going somewhere and straight back).
function cleanDots(points: RoutePoint[]) {
  const pts = points.map((p) => ({ ...spot(p), t: ms(p.at) })).sort((a, b) => a.t - b.t);
  return pts.filter((b, i) => {
    const a = pts[i - 1];
    const c = pts[i + 1];
    return !(a && c && metres(a, b) > 150 && metres(b, c) > 150 && metres(a, c) < 100);
  });
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
  for (let i = -1; i < vs.length; i++) {
    const from = i >= 0 ? vs[i] : null;
    const to = vs[i + 1] ?? null;
    const lo = from ? left[i] : -Infinity;
    if (lo === null) continue; // still at the last stop
    const hi = to ? ms(to.arrived_at) : Infinity;
    if (hi <= lo) continue;
    const inside = pts.filter((p) => p.t >= lo && p.t <= hi);
    if (!inside.length && !(from && to)) continue;
    if (!inside.length && from && to && metres(from, to) < 60) continue; // back to the same place

    // Runs of dots with no long gaps.
    const runs: (typeof inside)[] = [];
    for (const p of inside) {
      const run = runs[runs.length - 1];
      if (!run || missed(run[run.length - 1], p)) runs.push([p]);
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
      const joinsFrom = from && !missed({ ...spot(from), t: lo }, first); // the dots pick up right after leaving
      const joinsTo = to && !missed(last, { ...spot(to), t: hi }); // …and run right up to the next stop
      if (from && !joinsFrom) pieces.push({ path: [spot(from), spot(first)], missing: true });
      runs.forEach((run, r) => {
        if (r > 0) {
          const prev = runs[r - 1];
          pieces.push({ path: [spot(prev[prev.length - 1]), spot(run[0])], missing: true });
        }
        const path = run.map(spot);
        if (r === 0 && joinsFrom) path.unshift(spot(from!));
        if (r === runs.length - 1 && joinsTo) path.push(spot(to!));
        pieces.push({ path, missing: false });
      });
      if (to && !joinsTo) pieces.push({ path: [spot(last), spot(to)], missing: true });
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
      end: to ? hi : dots[dots.length - 1].t,
      pieces: kept,
      looseStart: from ? null : spot(dots[0]),
      looseEnd: to ? null : spot(dots[dots.length - 1]),
    });
  }
  return trips;
}

// Google's encoded polyline → spots.
export function decodePolyline(encoded: string): Spot[] {
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
    out.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return out;
}
