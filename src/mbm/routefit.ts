// Does a trusted route (one you gave 4-5 stars) fit this trip's dots? No set distances: each dot
// may be off by what the phone said its accuracy was, plus how unsure the phone was when the
// trusted route was recorded. Both ways round: every dot has to be near the line (you didn't go
// somewhere it doesn't), and every bit of the line has to be near your dots (it doesn't go
// somewhere you didn't, like the other side of the block on the way back).
import type { Dot } from "./legs";
import type { Spot } from "./trips";

// Metres from p to the line a-b (flat-earth: fine at this scale).
function toSegment(p: Spot, a: Spot, b: Spot) {
  const k = Math.cos((p.lat * Math.PI) / 180) * 111_320;
  const ax = (a.lng - p.lng) * k, ay = (a.lat - p.lat) * 110_540; // prettier-ignore
  const bx = (b.lng - p.lng) * k, by = (b.lat - p.lat) * 110_540; // prettier-ignore
  const dx = bx - ax, dy = by - ay; // prettier-ignore
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}
function toLine(p: Spot, line: Spot[]) {
  if (line.length === 1) return toSegment(p, line[0], line[0]);
  let best = Infinity;
  for (let i = 1; i < line.length; i++) best = Math.min(best, toSegment(p, line[i - 1], line[i]));
  return best;
}

export function fitsTrusted(dots: Dot[], line: Spot[], spread: number | null): boolean {
  // Too few dots to say, or no accuracy to judge by: it doesn't count as fitting.
  if (dots.length < 3 || line.length < 2) return false;
  if (dots.some((d) => d.acc == null)) return false;
  const extra = spread ?? 0;
  if (!dots.every((d) => toLine(d, line) <= 2 * d.acc! + extra)) return false;
  // The line's own ends run to the stops (your dots start a little after you leave and stop a
  // little before you arrive): only the part alongside your dots has to be near them.
  return line.every((v) => {
    let near = dots[0];
    let nearM = Infinity;
    for (const d of dots) {
      const m = toSegment(v, d, d);
      if (m < nearM) [near, nearM] = [d, m];
    }
    if (near === dots[0] || near === dots[dots.length - 1]) return true;
    return toLine(v, dots) <= 2 * near.acc! + extra;
  });
}
