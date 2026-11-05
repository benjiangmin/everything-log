"use client";

import { useEffect, useState } from "react";
import { dayData } from "@/app/mbm/actions";
import type { Day } from "@/mbm/data";
import { clock, dayTitle } from "@/mbm/time";
import BlockEditor from "./BlockEditor";
import SidePanel from "./SidePanel";

// Add a missed entry (on the day you're looking at), or change one you clicked on the bar.
export default function EntryPanel({ dayKey, blockId, onClose }: { dayKey: string; blockId?: string; onClose: () => void }) {
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
          onDone={onClose}
        />
      );
    } else {
      // A new one: starts where your last entry that day ended (or half an hour ago).
      const lastEnd = day.blocks.reduce((m, b) => (b.ended_at && +new Date(b.ended_at) <= until ? Math.max(m, +new Date(b.ended_at)) : m), 0);
      const from = lastEnd > dayStart && lastEnd < until ? lastEnd : Math.max(dayStart, until - 30 * 60000);
      const to = Math.max(from + 60000, until);
      body = (
        <BlockEditor
          dayKey={day.dayKey}
          tz={day.tz}
          activities={day.activities}
          from={from}
          to={to}
          onDone={onClose}
        />
      );
    }
  }

  const subtitle = !day ? (error ? "" : "Loading…") : block ? `${byId.get(block.activity_id ?? "")?.name ?? "Entry"} · since ${clock(block.started_at, day.tz)}` : dayTitle(day.dayKey);
  return (
    <SidePanel title={editing ? "Change entry" : "Add a missed entry"} subtitle={subtitle} onClose={onClose}>
      {body}
      {error && <p className="text-sm text-danger">{error}</p>}
    </SidePanel>
  );
}
