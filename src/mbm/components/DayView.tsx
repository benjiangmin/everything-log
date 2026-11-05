"use client";

import { useState } from "react";
import type { Day } from "@/mbm/data";
import { clock, span } from "@/mbm/time";
import BlockEditor from "./BlockEditor";
import DayBar from "./DayBar";
import NowCard from "./NowCard";
import { segmentsOf, type Segment } from "./segments";
import { useNow } from "./useNow";

// One day: (today) what you're doing now, the 24-hour bar, where the time went, and the list of
// blocks and gaps. Click a block (on the bar or the list) to change it; click a gap to fill it.
export default function DayView({ day, today, renderedAt }: { day: Day; today: boolean; renderedAt: number }) {
  const now = useNow(renderedAt);
  const dayStart = +new Date(day.start);
  const dayEnd = +new Date(day.end);
  const byId = new Map(day.activities.map((a) => [a.id, a]));
  const segments = segmentsOf(day.blocks, dayStart, dayEnd, now);
  // Which row is open: a block's id, "gap:<start>", or "new".
  const [open, setOpen] = useState<string | null>(null);
  const keyOf = (s: Segment) => (s.kind === "block" ? s.block.id : `gap:${s.start}`);

  // Totals: time per activity today, biggest first.
  const totals = new Map<string, number>();
  let tracked = 0;
  for (const s of segments) {
    if (s.kind !== "block") continue;
    const id = s.block.activity_id ?? "?";
    totals.set(id, (totals.get(id) ?? 0) + (s.end - s.start));
    tracked += s.end - s.start;
  }
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const soFar = Math.min(now, dayEnd) - dayStart;

  const editorFor = (s: Segment) => (
    <BlockEditor
      key={keyOf(s)}
      dayKey={day.dayKey}
      tz={day.tz}
      activities={day.activities}
      block={s.kind === "block" ? s.block : undefined}
      from={s.start}
      to={s.kind === "block" && !s.block.ended_at ? null : s.end}
      onDone={() => setOpen(null)}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      {today && <NowCard activities={day.activities} now={day.now} tz={day.tz} renderedAt={renderedAt} />}

      <section aria-label="The day" className="rounded-card border-[1.5px] border-ink p-4 sm:p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">The day</h2>
          <p className="num text-sm text-muted">
            {span(tracked)} tracked{soFar > 0 && ` of ${span(soFar)}`}
          </p>
        </div>
        <DayBar
          segments={segments}
          dayKey={day.dayKey}
          dayStart={dayStart}
          dayEnd={dayEnd}
          now={now}
          tz={day.tz}
          byId={byId}
          selected={open}
          onSelect={(s) => s.kind !== "future" && setOpen(keyOf(s))}
        />

        {sorted.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
            {sorted.map(([id, ms]) => {
              const a = byId.get(id);
              return (
                <li key={id} className="flex items-center gap-1.5 text-sm">
                  <span className="size-2.5 rounded-full" style={{ background: a?.color ?? "#a98467" }} />
                  <span className="text-ink">{a?.name ?? "Something"}</span>
                  <span className="num text-muted">{span(ms)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label="Timeline">
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <h2 className="font-display text-lg font-semibold">Timeline</h2>
          <button
            type="button"
            onClick={() => setOpen(open === "new" ? null : "new")}
            className="rounded-control px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-line transition-colors hover:bg-surface"
          >
            + Add
          </button>
        </div>
        {open === "new" && (
          <div className="mb-3">
            <BlockEditor
              dayKey={day.dayKey}
              tz={day.tz}
              activities={day.activities}
              from={Math.max(dayStart, Math.min(now, dayEnd) - 30 * 60000)}
              to={Math.min(now, dayEnd)}
              onDone={() => setOpen(null)}
            />
          </div>
        )}
        <ol className="flex flex-col gap-1.5">
          {segments
            .filter((s) => s.kind !== "future")
            .map((s) => {
              const k = keyOf(s);
              if (open === k) return <li key={k}>{editorFor(s)}</li>;
              const label = `${clock(new Date(s.start), day.tz)} – ${s.kind === "block" && !s.block.ended_at ? "now" : clock(new Date(s.end), day.tz)}`;
              if (s.kind === "gap") {
                return (
                  <li key={k}>
                    <button
                      type="button"
                      onClick={() => setOpen(k)}
                      className="group flex w-full items-center gap-3 rounded-control border border-dashed border-line px-3 py-2 text-left text-sm text-muted transition-colors hover:border-muted hover:text-ink"
                    >
                      <span className="num w-[7.5rem] shrink-0 whitespace-nowrap text-xs sm:w-[8.25rem] sm:text-sm">{label}</span>
                      <span className="flex-1">Untracked</span>
                      <span className="num whitespace-nowrap">{span(s.end - s.start)}</span>
                      <span className="hidden font-semibold opacity-0 transition-opacity group-hover:opacity-100 sm:inline">+ Fill</span>
                    </button>
                  </li>
                );
              }
              const a = s.block.activity_id ? byId.get(s.block.activity_id) : undefined;
              return (
                <li key={k}>
                  <button
                    type="button"
                    onClick={() => setOpen(k)}
                    className="flex w-full items-center gap-3 rounded-control bg-surface/80 px-3 py-2.5 text-left transition-colors hover:bg-surface"
                  >
                    <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: a?.color ?? "#a98467" }} />
                    <span className="num w-[7.5rem] shrink-0 whitespace-nowrap text-xs text-muted sm:w-[8.25rem] sm:text-sm">{label}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{a?.name ?? "Something"}</span>
                      {s.block.note && <span className="block truncate text-xs text-muted">{s.block.note}</span>}
                    </span>
                    <span className="num shrink-0 whitespace-nowrap text-sm text-muted">{span(s.end - s.start)}</span>
                  </button>
                </li>
              );
            })}
        </ol>
        {segments.every((s) => s.kind === "future") && <p className="px-1 text-sm text-muted">This day hasn&apos;t started yet.</p>}
      </section>
    </div>
  );
}
