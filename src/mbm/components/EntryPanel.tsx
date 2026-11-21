"use client";

import { useEffect, useState } from "react";
import { dayData } from "@/app/mbm/actions";
import type { Day } from "@/mbm/data";
import { clock, dayTitle } from "@/mbm/time";
import BlockEditor, { type Merge } from "./BlockEditor";
import SidePanel from "./SidePanel";

// Add a missed entry (on the day you're looking at, or for the untracked stretch you clicked), or
// change one you clicked on the bar.
export default function EntryPanel({
  dayKey,
  blockId,
  span,
  side,
  onClose,
}: {
  dayKey: string;
  blockId?: string;
  span?: { from: number; to: number }; // the untracked stretch to fill in
  side?: "left" | "right"; // (from the corner bubble: slides in from the left, next to it)
  onClose: () => void;
}) {
  const [day, setDay] = useState<Day | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    dayData(dayKey).then((res) => {
      if (!live) return;
      if (res.ok) setDay(res.day);
      else setError(res.message);
    });
    return () => {
      live = false;
    };
  }, [dayKey]);

  const block = blockId ? day?.blocks.find((b) => b.id === blockId) : undefined;
  const editing = Boolean(blockId);
  const byId = new Map((day?.activities ?? []).map((a) => [a.id, a]));

  let body = null;
  if (day) {
    const dayStart = +new Date(day.start);
    const dayEnd = +new Date(day.end);
    const until = Math.min(day.loadedAt, dayEnd);
    // The day's other entries: their starts and ends are handy times to snap to.
    const others = day.blocks
      .filter((b) => b.id !== blockId)
      .map((b) => ({
        name: (b.activity_id && byId.get(b.activity_id)?.name) || "an entry",
        start: Math.max(dayStart, +new Date(b.started_at)),
        end: b.ended_at ? Math.min(+new Date(b.ended_at), dayEnd) : null,
      }));
    // The entries right before and after this one, if they're the same job: offered to merge
    // into one. (Right before/after: nothing else starts in between.)
    const merges: Merge[] = [];
    if (block?.activity_id) {
      const sorted = [...day.blocks].sort((x, y) => +new Date(x.started_at) - +new Date(y.started_at));
      const i = sorted.findIndex((b) => b.id === block.id);
      const job = byId.get(block.activity_id);
      const span = (b: typeof block) => `${clock(b.started_at, day.tz)} – ${b.ended_at ? clock(b.ended_at, day.tz) : "now"}`;
      const before = sorted[i - 1];
      const after = sorted[i + 1];
      const base = { name: job?.name ?? "Entry", color: job?.color ?? "#a98467" };
      if (before && before.activity_id === block.activity_id) merges.push({ ...base, id: before.id, side: "before", time: span(before) });
      if (after && after.activity_id === block.activity_id) merges.push({ ...base, id: after.id, side: "after", time: span(after) });
    }
    if (editing && !block) body = <p className="text-sm text-muted">That entry is gone.</p>;
    else if (block) {
      body = (
        <BlockEditor
          dayKey={day.dayKey}
          tz={day.tz}
          activities={day.activities}
          block={block}
          from={Math.max(dayStart, +new Date(block.started_at))}
          to={block.ended_at ? Math.min(+new Date(block.ended_at), dayEnd) : null}
          others={others}
          merges={merges}
          onDone={onClose}
        />
      );
    } else {
      // A new one: starts where your last entry that day ended (or half an hour ago).
      const lastEnd = day.blocks.reduce((m, b) => (b.ended_at && +new Date(b.ended_at) <= until ? Math.max(m, +new Date(b.ended_at)) : m), 0);
      const from = span ? span.from : lastEnd > dayStart && lastEnd < until ? lastEnd : Math.max(dayStart, until - 30 * 60000);
      const to = span ? span.to : Math.max(from + 60000, until);
      body = (
        <BlockEditor
          dayKey={day.dayKey}
          tz={day.tz}
          activities={day.activities}
          from={from}
          to={to}
          others={others}
          onDone={onClose}
        />
      );
    }
  }

  const subtitle = !day ? (error ? "" : "Loading…") : block ? `${byId.get(block.activity_id ?? "")?.name ?? "Entry"} · since ${clock(block.started_at, day.tz)}` : dayTitle(day.dayKey);
  return (
    <SidePanel title={editing ? "Change entry" : "Add a missed entry"} subtitle={subtitle} onClose={onClose} side={side}>
      {body}
      {error && <p className="text-sm text-danger">{error}</p>}
    </SidePanel>
  );
}
