"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import { unlockDay } from "@/app/mbm/actions";
import type { Day } from "@/mbm/data";
import type { Focus } from "./DayMapInner";
import type { DayPlan } from "./DayBar";

// The map only runs in the browser (it needs the page's window), so it loads after the page.
const Inner = dynamic(() => import("./DayMapInner"), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-surface" />,
});

export default function DayMap({
  day,
  focus = null,
  pin = null,
  liveColor = null,
  onPointer,
  gestures = "cooperative",
  bare = false,
}: {
  bare?: boolean; // just the map (the day page's map layout puts its own things on top)
  gestures?: "cooperative" | "greedy"; // greedy: scroll / pinch zooms the map (when it's the screen you're on)
  day: Day;
  focus?: Focus | null;
  pin?: DayPlan | null;
  liveColor?: string | null;
  onPointer?: (spans: { start: number; end: number }[] | null) => void;
}) {
  const empty = day.visits.length === 0 && day.points.length === 0;
  const [showDots, setShowDots] = useState(false);
  const [redrawing, redraw] = useTransition();
  return (
    // On the "Map" screen it fills the window under the day bar (see DayView).
    <section
      aria-label="Map"
      className={`overflow-hidden rounded-card border-[1.5px] border-ink ${empty ? "" : "flex min-h-0 flex-1 flex-col"}`}
    >
      <div className={`flex items-baseline justify-between gap-3 px-4 pb-3 pt-4 sm:px-6 ${bare && !empty ? "hidden" : ""}`}>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold">Where you went</h2>
          {!empty && (
            <p className="text-xs text-muted">
              Click a stop to rename, move or remove it; click a route that
              looks wrong to report it (
              <a href="/mbm/route-reports" className="underline underline-offset-2 hover:text-ink">
                download reports
              </a>
              ).
            </p>
          )}
          {day.locked && (
            <p className="mt-0.5 text-xs text-muted">
              This day&rsquo;s routes are saved as they were.{" "}
              <button
                type="button"
                disabled={redrawing}
                onClick={() => redraw(async () => void (await unlockDay(day.dayKey)))}
                className="underline underline-offset-2 hover:text-ink"
              >
                {redrawing ? "Redrawing…" : "Redraw"}
              </button>
            </p>
          )}
        </div>
        {!empty && (
          <div className="flex items-center gap-3 text-sm text-muted">
            <span>
              {day.visits.length} {day.visits.length === 1 ? "stop" : "stops"}
            </span>
            {/* (Always there, so you can tell "no dots came in" from "the button's gone".) */}
            {day.points.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowDots((d) => !d)}
                aria-pressed={showDots}
                className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                  showDots ? "border-accent bg-accent text-accent-ink" : "border-line hover:border-ink/40 hover:text-ink"
                }`}
              >
                {showDots ? `Hide dots (${day.points.length})` : `Show dots (${day.points.length})`}
              </button>
            ) : (
              <span
                title="The phone hasn't sent any location dots for this day yet. It records few or none while you stay in one place."
                className="rounded-full border border-dashed border-line px-2.5 py-0.5 text-xs"
              >
                No dots yet
              </span>
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
        // The map fills this box exactly (absolute: the box's height comes from the page's layout,
        // which a plain height: 100% can't follow, and the map would come out 0 px tall).
        <div className={`relative isolate min-h-[24rem] flex-1 ${bare ? "" : "border-t border-line"}`}>
          <div className="absolute inset-0">
            <Inner
              visits={day.visits}
              points={day.points}
              blocks={day.blocks}
              activities={day.activities}
              tz={day.tz}
              focus={focus}
              pin={pin}
              showDots={showDots}
              liveColor={liveColor}
              onPointer={onPointer}
              gestures={gestures}
              topCover={bare ? 150 : 0}
              dayKey={day.dayKey}
              finished={day.finished}
              locked={day.locked}
            />
          </div>
        </div>
      )}
    </section>
  );
}
