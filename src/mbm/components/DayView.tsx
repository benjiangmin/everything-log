"use client";

import type { Day } from "@/mbm/data";
import { span } from "@/mbm/time";
import DayBar from "./DayBar";
import NowStatus from "./NowStatus";
import { openMbm } from "./open";
import { layOut } from "./segments";
import { useNow } from "./useNow";

// One day: (today) what's running, the 24-hour bar with where the time went, and the map.
// Click an entry on the bar to change it; add missed ones from the sidebar.
export default function DayView({ day, today, renderedAt }: { day: Day; today: boolean; renderedAt: number }) {
  const now = useNow(renderedAt);
  const dayStart = +new Date(day.start);
  const dayEnd = +new Date(day.end);
  const byId = new Map(day.activities.map((a) => [a.id, a]));
  const { placed, lanes, gaps, covered, until } = layOut(day.blocks, dayStart, dayEnd, now);

  // Time per activity, biggest first (overlapping entries each count their own time).
  const totals = new Map<string, number>();
  for (const p of placed) totals.set(p.block.activity_id ?? "?", (totals.get(p.block.activity_id ?? "?") ?? 0) + (p.end - p.start));
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const soFar = until - dayStart;

  return (
    <div className="flex flex-col gap-5">
      {today && <NowStatus activities={day.activities} running={day.running} tz={day.tz} renderedAt={renderedAt} />}

      <section aria-label="The day" className="rounded-card border-[1.5px] border-ink px-4 pb-4 pt-4 sm:px-6 sm:pb-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="font-display text-lg font-semibold">The day</h2>
          <p className="num text-sm text-muted">
            {span(covered)} tracked{soFar > 0 && ` of ${span(soFar)}`}
          </p>
        </div>
        <DayBar
          placed={placed}
          lanes={lanes}
          gaps={gaps}
          dayKey={day.dayKey}
          dayStart={dayStart}
          dayEnd={dayEnd}
          now={now}
          tz={day.tz}
          byId={byId}
          onSelect={(b) => openMbm({ kind: "edit", dayKey: day.dayKey, blockId: b.id })}
        />
        {sorted.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5">
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
        ) : (
          <p className="mt-4 text-sm text-muted">Nothing tracked {today ? "yet today" : "this day"}.</p>
        )}
      </section>

      {/* The map: where you went and the routes between. Fills in once the iPhone app is tracking. */}
      <section aria-label="Map" className="rounded-card border-[1.5px] border-dashed border-line px-5 py-10 text-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-muted" aria-hidden="true">
          <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
          <path d="M9 4v14M15 6v14" />
        </svg>
        <p className="mt-2 font-display text-lg font-semibold text-ink">Map</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">Where you went and the routes between will show up here once the iPhone app is tracking your location.</p>
      </section>
    </div>
  );
}
