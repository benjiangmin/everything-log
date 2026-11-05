"use client";

import type { Day } from "@/mbm/data";
import DayBar from "./DayBar";
import NowStatus from "./NowStatus";
import { openMbm } from "./open";
import { layOut } from "./segments";
import { useNow } from "./useNow";

// One day: (today) what's running, the 24-hour bar, and the map. Hover an entry on the bar for
// what it was; click it to change it; add missed ones from the sidebar.
export default function DayView({ day, today, renderedAt }: { day: Day; today: boolean; renderedAt: number }) {
  const now = useNow(renderedAt);
  const dayStart = +new Date(day.start);
  const dayEnd = +new Date(day.end);
  const byId = new Map(day.activities.map((a) => [a.id, a]));
  const { placed, lanes, gaps } = layOut(day.blocks, dayStart, dayEnd, now);

  return (
    <div className="flex flex-col gap-5">
      {today && <NowStatus activities={day.activities} running={day.running} tz={day.tz} renderedAt={renderedAt} />}

      <section aria-label="The day" className="rounded-card border-[1.5px] border-ink px-4 pb-4 pt-4 sm:px-6 sm:pb-5">
        <h2 className="mb-4 font-display text-lg font-semibold">The day</h2>
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
