"use client";

import type { Day } from "@/mbm/data";
import NowStatus from "./NowStatus";
import { openMbm } from "./open";

// Home's box: what's running right now (each with its timer and Stop), + Start / Switch, and a way
// to add something you forgot to start.
export default function MbmHome({ day, renderedAt }: { day: Day; renderedAt: number }) {
  return (
    <section aria-label="Right now" className="mt-8 rounded-card border-2 border-ink p-4 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Right now</h2>
        <button
          type="button"
          onClick={() => openMbm({ kind: "add", dayKey: day.dayKey })}
          className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          + Add a missed entry
        </button>
      </div>
      <NowStatus activities={day.activities} running={day.running} tz={day.tz} renderedAt={renderedAt} />
    </section>
  );
}
