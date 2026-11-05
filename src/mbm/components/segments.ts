import type { Block } from "@/mbm/data";

// A day's entries laid out for the bar. Entries can overlap, so each gets a lane (row): the first
// lane that's free when it starts. Times are trimmed to the day; running ones end at now.
export type Placed = { block: Block; start: number; end: number; lane: number };

export function layOut(blocks: Block[], dayStart: number, dayEnd: number, now: number) {
  const until = Math.min(dayEnd, Math.max(dayStart, now));
  const laneEnds: number[] = [];
  const placed: Placed[] = [];
  for (const b of [...blocks].sort((x, y) => +new Date(x.started_at) - +new Date(y.started_at))) {
    const start = Math.max(dayStart, +new Date(b.started_at));
    const end = Math.min(b.ended_at ? +new Date(b.ended_at) : until, dayEnd);
    if (end <= start) continue;
    let lane = laneEnds.findIndex((e) => e <= start);
    if (lane === -1) lane = laneEnds.push(end) - 1;
    else laneEnds[lane] = end;
    placed.push({ block: b, start, end, lane });
  }
  // Time covered by at least one entry (overlaps counted once), and the untracked gaps between.
  let covered = 0;
  let reach = dayStart;
  const gaps: { start: number; end: number }[] = [];
  for (const p of [...placed].sort((a, b) => a.start - b.start)) {
    if (p.end <= reach) continue;
    if (p.start > reach) gaps.push({ start: reach, end: Math.min(p.start, until) });
    covered += p.end - Math.max(p.start, reach);
    reach = p.end;
  }
  if (reach < until) gaps.push({ start: reach, end: until });
  return { placed, lanes: Math.max(1, laneEnds.length), covered, until, gaps: gaps.filter((g) => g.end > g.start) };
}
