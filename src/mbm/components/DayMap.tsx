"use client";

import dynamic from "next/dynamic";
import type { Day } from "@/mbm/data";

// The map only runs in the browser (it needs the page's window), so it loads after the page.
const Inner = dynamic(() => import("./DayMapInner"), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-surface" />,
});

export default function DayMap({ day }: { day: Day }) {
  const empty = day.visits.length === 0 && day.points.length === 0;
  return (
    <section aria-label="Map" className="overflow-hidden rounded-card border-[1.5px] border-ink">
      <div className="flex items-baseline justify-between gap-3 px-4 pb-3 pt-4 sm:px-6">
        <h2 className="font-display text-lg font-semibold">Where you went</h2>
        {!empty && (
          <p className="text-sm text-muted">
            {day.visits.length} {day.visits.length === 1 ? "stop" : "stops"}
          </p>
        )}
      </div>
      {empty ? (
        <p className="border-t border-line px-5 py-10 text-center text-sm text-muted">
          Nothing recorded this day. The iPhone app records where you go once location is on.
        </p>
      ) : (
        // isolate: keeps the map's own layers under the page's popups and panels.
        <div className="isolate h-[22rem] border-t border-line sm:h-[26rem]">
          <Inner visits={day.visits} points={day.points} tz={day.tz} />
        </div>
      )}
    </section>
  );
}
