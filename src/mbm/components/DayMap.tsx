"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { Day } from "@/mbm/data";
import type { Focus } from "./DayMapInner";

// The map only runs in the browser (it needs the page's window), so it loads after the page.
const Inner = dynamic(() => import("./DayMapInner"), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-surface" />,
});

export default function DayMap({
  day,
  focus = null,
  liveColor = null,
  onPointer,
  gestures = "cooperative",
}: {
  gestures?: "cooperative" | "greedy"; // greedy: scroll / pinch zooms the map (when it's the screen you're on)
  day: Day;
  focus?: Focus | null;
  liveColor?: string | null;
  onPointer?: (spans: { start: number; end: number }[] | null) => void;
}) {
  const empty = day.visits.length === 0 && day.points.length === 0;
  const [showDots, setShowDots] = useState(false);
  return (
    // The "Map" screen: fills the window, so the page snaps to it and gestures go to the map.
    <section
      aria-label="Map"
      data-screen={empty ? undefined : "map"}
      className={`overflow-hidden rounded-card border-[1.5px] border-ink ${empty ? "" : "flex h-[calc(100dvh-2rem)] min-h-[30rem] snap-start scroll-mt-4 flex-col"}`}
    >
      <div className="flex items-baseline justify-between gap-3 px-4 pb-3 pt-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold">Where you went</h2>
          {!empty && (
            <p className="text-xs text-muted">
              Hover a route or stop to see it on the bar. Dashed: the phone missed that bit. Click a stop to rename, move or remove it.
            </p>
          )}
        </div>
        {!empty && (
          <div className="flex items-center gap-3 text-sm text-muted">
            <span>
              {day.visits.length} {day.visits.length === 1 ? "stop" : "stops"}
            </span>
            {day.points.length > 0 && (
              <button
                type="button"
                onClick={() => setShowDots((d) => !d)}
                aria-pressed={showDots}
                className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                  showDots ? "border-accent bg-accent text-accent-ink" : "border-line hover:border-ink/40 hover:text-ink"
                }`}
              >
                {showDots ? `Hide dots (${day.points.length})` : "Show dots"}
              </button>
            )}
          </div>
        )}
      </div>
      {empty ? (
        <p className="border-t border-line px-5 py-10 text-center text-sm text-muted">
          Nothing recorded this day. The iPhone app records where you go once location is on.
        </p>
      ) : (
        // isolate: keeps the map's own layers under the page's popups and panels.
        <div className="relative isolate min-h-0 flex-1 border-t border-line">
          <Inner
            visits={day.visits}
            points={day.points}
            blocks={day.blocks}
            activities={day.activities}
            tz={day.tz}
            focus={focus}
            showDots={showDots}
            liveColor={liveColor}
            onPointer={onPointer}
            gestures={gestures}
          />
        </div>
      )}
    </section>
  );
}
