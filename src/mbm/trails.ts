import type { Dot } from "./legs";
import { metres, type Spot } from "./trips";

// Your trails: the line you usually walk, learned from every walk you've recorded
// (028_trails.sql boils them down to small squares, each with how often you've been through it,
// the middle of your dots there, and which way the path runs). A new walk's dots are pulled
// sideways onto that line, never along it (so its timing and length stay yours). The more often
// you've walked somewhere, the harder the pull: a new route is drawn as recorded, a route you
// take every day comes out the same clean line every time. It only knows your own dots, so it
// works the same anywhere, for anyone.

export type TrailCell = { lat: number; lng: number; n: number; c2: number; s2: number };

const REACH = 18; // m: cells this close can pull a dot
const SPREAD = 8; // m: how fast a cell's pull fades with distance
const MAX_SHIFT = 18; // m: never moved further than this
const FULL = 24; // walks-through worth of dots nearby for the full pull (fewer: a partial pull)

export function makeTrails(cells: TrailCell[]) {
  if (!cells.length) return null;
  const lat0 = cells[0].lat;
  const k = Math.cos((lat0 * Math.PI) / 180) * 111320;
  const xy = (s: Spot) => ({ x: s.lng * k, y: s.lat * 110540 });
  const grid = new Map<string, { x: number; y: number; n: number; axis: number; sure: number }[]>();
  const key = (x: number, y: number) => `${Math.floor(x / REACH)}:${Math.floor(y / REACH)}`;
  for (const c of cells) {
    const p = xy(c);
    const entry = { ...p, n: c.n, axis: Math.atan2(c.s2, c.c2) / 2, sure: Math.min(1, Math.hypot(c.c2, c.s2)) };
    const g = key(p.x, p.y);
    if (!grid.has(g)) grid.set(g, []);
    grid.get(g)!.push(entry);
  }
  const around = (x: number, y: number) => {
    const gx = Math.floor(x / REACH);
    const gy = Math.floor(y / REACH);
    const out: { x: number; y: number; n: number; axis: number; sure: number }[] = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) out.push(...(grid.get(`${gx + i}:${gy + j}`) ?? []));
    return out;
  };

  // Pulls a walk's dots onto your usual line.
  return function center(dots: Dot[]): Dot[] {
    return dots.map((d, i) => {
      const a = dots[Math.max(0, i - 1)];
      const b = dots[Math.min(dots.length - 1, i + 1)];
      if (metres(a, b) < 2) return d; // (standing still: no direction to go by)
      const p = xy(d);
      const pa = xy(a);
      const pb = xy(b);
      const heading = Math.atan2(pb.y - pa.y, pb.x - pa.x);
      const nx = -Math.sin(heading);
      const ny = Math.cos(heading);
      let w = 0;
      let off = 0;
      let seen = 0;
      for (const c of around(p.x, p.y)) {
        const dx = c.x - p.x;
        const dy = c.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > REACH) continue;
        if (Math.abs(Math.cos(c.axis - heading)) < 0.8) continue; // a path crossing this one, not this one
        const cw = c.n * c.sure * Math.exp(-(dist * dist) / (2 * SPREAD * SPREAD));
        w += cw;
        off += cw * (dx * nx + dy * ny); // how far the trail is to the side of this dot
        seen += c.n;
      }
      if (w <= 0 || seen < 6) return d; // not walked here enough to know
      const strength = Math.min(1, seen / FULL);
      const shift = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, (off / w) * strength));
      return { ...d, lat: d.lat + (ny * shift) / 110540, lng: d.lng + (nx * shift) / k };
    });
  };
}

// Takes out sharp little divots: a point where the line doubles back on itself over a few
// metres (two GPS readings either side of a street, a slice of a match meeting your dots).
export function despike(path: Spot[]): Spot[] {
  let out = path;
  for (let pass = 0; pass < 3; pass++) {
    const next: Spot[] = [];
    for (let i = 0; i < out.length; i++) {
      const a = next[next.length - 1];
      const b = out[i];
      const c = out[i + 1];
      if (a && c) {
        const ab = metres(a, b);
        const bc = metres(b, c);
        const ac = metres(a, c);
        const sharp = ab + bc > ac * 1.8 + 6; // goes out and comes back
        if (sharp && ab < 30 && bc < 30) continue;
      }
      next.push(b);
    }
    if (next.length === out.length) break;
    out = next;
  }
  return out;
}
