import type { Block } from "@/mbm/data";

// A day cut into pieces, start to end: your blocks (trimmed to the day), the untracked gaps
// between them, and (today) the part that hasn't happened yet.
export type Segment =
  | { kind: "block"; block: Block; start: number; end: number }
  | { kind: "gap"; start: number; end: number }
  | { kind: "future"; start: number; end: number };

export function segmentsOf(blocks: Block[], dayStart: number, dayEnd: number, now: number): Segment[] {
  const until = Math.min(dayEnd, Math.max(dayStart, now)); // the day so far
  const out: Segment[] = [];
  let at = dayStart;
  for (const b of [...blocks].sort((x, y) => +new Date(x.started_at) - +new Date(y.started_at))) {
    const s = Math.max(dayStart, +new Date(b.started_at));
    const e = Math.min(b.ended_at ? +new Date(b.ended_at) : until, dayEnd);
    if (e <= s) continue;
    if (s > at) out.push({ kind: "gap", start: at, end: Math.min(s, until) });
    out.push({ kind: "block", block: b, start: s, end: e });
    at = e;
  }
  if (at < until) out.push({ kind: "gap", start: at, end: until });
  if (until < dayEnd) out.push({ kind: "future", start: Math.max(at, until), end: dayEnd });
  return out.filter((x) => x.end > x.start);
}
