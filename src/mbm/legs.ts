import { metres, type Spot } from "./trips";

// A trip, split by how you were moving. The path engine draws each leg its own way:
//   walk  — on walkways and paths (snapped as a pedestrian)
//   bike  — on bike paths and roads (a bike or scooter)
//   ride  — on roads and bus lanes (a bus or a car)
//   wait  — standing still right before (or between) rides: a bus stop. Drawn as a marker, not a
//           zigzag of GPS jitter, and never as a detour.
// Works from the phone's own speed for each dot (or the speed between dots when it has none), so
// it needs nothing about the place: the same rules hold in any city.

export type Dot = Spot & { t: number; speed: number | null; acc: number | null };
export type Mode = "walk" | "bike" | "ride" | "wait";
export type Leg = { mode: Mode; dots: Dot[]; start: number; end: number };

// Speeds, in metres a second.
const WALK_MAX = 2.6; // ~6 mph: faster than this for a while isn't walking (a jog is borderline)
const BIKE_MAX = 8.5; // ~19 mph: a bike seldom holds more; a bus or car does
const STILL = 0.6;
const PAUSE = 90_000; // a bus stopping, a red light: a slow bit this short inside a ride is still the ride
const WAIT_MIN = 45_000; // standing still at least this long before a ride: waiting for it

// Each dot's speed: the phone's, or else from the dots either side.
function speeds(dots: Dot[]) {
  return dots.map((d, i) => {
    if (d.speed != null && d.speed >= 0) return d.speed;
    const a = dots[Math.max(0, i - 1)];
    const b = dots[Math.min(dots.length - 1, i + 1)];
    const s = (b.t - a.t) / 1000;
    return s > 0 ? metres(a, b) / s : 0;
  });
}

// The middle value of the dots around each one (one odd reading doesn't flip the mode).
function smooth(v: number[], r = 2) {
  return v.map((_, i) => {
    const w = v.slice(Math.max(0, i - r), i + r + 1).sort((a, b) => a - b);
    return w[Math.floor(w.length / 2)];
  });
}

const median = (v: number[]) => {
  const w = [...v].sort((a, b) => a - b);
  return w.length ? w[Math.floor(w.length / 2)] : 0;
};

export function splitLegs(dots: Dot[]): Leg[] {
  if (dots.length < 2) return dots.length ? [{ mode: "walk", dots, start: dots[0].t, end: dots[0].t }] : [];
  const sp = smooth(speeds(dots));
  // 1. Fast or slow, dot by dot, in runs.
  type Run = { fast: boolean; from: number; to: number }; // indexes, inclusive
  const runs: Run[] = [];
  sp.forEach((s, i) => {
    const fast = s > WALK_MAX;
    const last = runs[runs.length - 1];
    if (last && last.fast === fast) last.to = i;
    else runs.push({ fast, from: i, to: i });
  });
  // 2. A short slow bit between two fast ones is the ride stopping (a bus stop, a light), not you
  //    getting off; a fast blip of one or two dots in a walk is a GPS jump, not a ride.
  const t = (i: number) => dots[i].t;
  for (let changed = true; changed; ) {
    changed = false;
    for (let r = 0; r < runs.length; r++) {
      const run = runs[r];
      const prev = runs[r - 1];
      const next = runs[r + 1];
      // (Fast for under 45 s or 150 m isn't a ride or a bike: a few jumpy dots.)
      const short = run.fast ? run.to - run.from < 2 || t(run.to) - t(run.from) < 45_000 || metres(dots[run.from], dots[run.to]) < 150 : t(run.to) - t(run.from) < PAUSE;
      if (prev && next && short && prev.fast === next.fast) {
        prev.to = next.to;
        runs.splice(r, 2);
        changed = true;
        break;
      }
      if (run.fast && short && !(prev && next && prev.fast === next.fast)) {
        run.fast = false; // a jump at the very start or end
        if (prev && !prev.fast) {
          prev.to = run.to;
          runs.splice(r, 1);
          changed = true;
          break;
        }
        if (next && !next.fast) {
          next.from = run.from;
          runs.splice(r, 1);
          changed = true;
          break;
        }
      }
    }
  }
  // 3. Name each run: fast → bike or ride (by how fast it gets); slow → walk, or a wait when
  //    it's standing still before a ride.
  const legs: Leg[] = [];
  runs.forEach((run) => {
    const ds = dots.slice(run.from, run.to + 1);
    const s = sp.slice(run.from, run.to + 1);
    let mode: Mode;
    if (run.fast) {
      const top = [...s].sort((a, b) => b - a)[Math.min(2, s.length - 1)]; // (the third fastest: not one glitch)
      mode = top > BIKE_MAX ? "ride" : median(s) > WALK_MAX ? "bike" : "walk";
    } else {
      mode = "walk";
    }
    legs.push({ mode, dots: ds, start: ds[0].t, end: ds[ds.length - 1].t });
  });
  // 4. Waiting: the still end of a walk right before a ride (also between two rides: changing
  //    buses). The walk up to the stop stays a walk.
  const out: Leg[] = [];
  legs.forEach((leg, i) => {
    const next = legs[i + 1];
    if (leg.mode !== "walk" || next?.mode !== "ride") {
      out.push(leg);
      return;
    }
    const s = smooth(speeds(leg.dots));
    let k = leg.dots.length; // where the still tail starts
    while (k > 0 && s[k - 1] <= STILL) k--;
    if (k === leg.dots.length) k = leg.dots.length - 1; // (its last dot, at least: standing dots are thinned out)
    const tail = leg.dots.slice(k);
    // From the first still dot until the ride sets off (standing still, the phone records few dots).
    const until = next ? next.start : tail[tail.length - 1].t;
    if (until - tail[0].t >= WAIT_MIN) {
      const walk = leg.dots.slice(0, k + 1);
      if (walk.length > 1) out.push({ mode: "walk", dots: walk, start: walk[0].t, end: walk[walk.length - 1].t });
      out.push({ mode: "wait", dots: tail, start: tail[0].t, end: until });
    } else {
      out.push(leg);
    }
  });
  // Neighbours of the same kind join up.
  const joined: Leg[] = [];
  for (const leg of out) {
    const last = joined[joined.length - 1];
    if (last && last.mode === leg.mode) {
      last.dots = [...last.dots, ...leg.dots];
      last.end = leg.end;
    } else joined.push({ ...leg, dots: [...leg.dots] });
  }
  return joined;
}

// Where a wait was: the most accurate middle of its dots.
export function waitSpot(leg: Leg): Spot {
  let w = 0;
  let lat = 0;
  let lng = 0;
  for (const d of leg.dots) {
    const k = 1 / Math.max(5, d.acc ?? 20) ** 2;
    w += k;
    lat += d.lat * k;
    lng += d.lng * k;
  }
  return w ? { lat: lat / w, lng: lng / w } : leg.dots[0];
}
