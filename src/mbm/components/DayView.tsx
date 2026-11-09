"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Day } from "@/mbm/data";
import DayBar from "./DayBar";
import DayMap from "./DayMap";
import type { Focus } from "./DayMapInner";
import NowChip from "./NowChip";
import { openMbm } from "./open";
import { layOut } from "./segments";
import { isMoving } from "@/mbm/moving";
import { useNow } from "./useNow";

// One day: the 24-hour bar and the map (and, today, what's running, in the corner). Hover an entry
// on the bar for what it was; click it to change it; click an untracked stretch to fill it in.
//
// Two layouts, switched with the ▾ / ▴ button:
//   - normal: the day's title, the day box, then the map under it
//   - map: the map fills the window, with the title and a slimmer bar floating in a bubble on it
// title / subtitle / nav (the day before / after) come from the page.
export default function DayView({
  day,
  today,
  renderedAt,
  title,
  subtitle,
  nav,
}: {
  day: Day;
  today: boolean;
  renderedAt: number;
  title: string;
  subtitle?: string;
  nav: ReactNode;
}) {
  const now = useNow(renderedAt);
  const dayStart = +new Date(day.start);
  const dayEnd = +new Date(day.end);
  const byId = new Map(day.activities.map((a) => [a.id, a]));
  const { placed, lanes, gaps } = layOut(day.blocks, dayStart, dayEnd, now);
  const [focus, setFocus] = useState<Focus | null>(null); // hovering the bar → lit up on the map
  const [marks, setMarks] = useState<{ start: number; end: number }[] | null>(null); // hovering the map → outlined on the bar
  // Remembered (per browser), so it stays when going to another day.
  const mapMode = useSyncExternalStore(subscribe, readMapMode, () => false);
  const setMapMode = (f: (v: boolean) => boolean) => writeMapMode(f(mapMode));
  useNoPageZoom();

  const bar = (
    <DayBar
      key={day.dayKey}
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
      marks={marks}
      phone={day.phone}
      slim={mapMode}
      onHover={(h) =>
        setFocus(
          h && {
            start: h.start,
            end: h.end,
            // Commute → the route; anything else → where you were; untracked → either.
            kind: !h.block ? "any" : isMoving(h.block.activity_id ? byId.get(h.block.activity_id)?.name : null) ? "moving" : "still",
          },
        )
      }
      onSelectGap={(g) => openMbm({ kind: "add", dayKey: day.dayKey, from: g.start, to: g.end })}
    />
  );
  const toggle = (onBorder: boolean) => (
    <button
      type="button"
      onClick={() => setMapMode((v) => !v)}
      aria-label={mapMode ? "Back to the day box" : "Make the map bigger"}
      title={mapMode ? "Smaller map" : "Bigger map"}
      className={`grid size-8 shrink-0 place-items-center rounded-full bg-paper text-muted transition-colors hover:bg-surface hover:text-ink ${
        onBorder ? "absolute -top-4 right-6 z-10 ring-[1.5px] ring-ink" : "ring-1 ring-line"
      }`}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={mapMode ? "rotate-180" : ""}>
        <path d="M5 15l7-7 7 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );

  return (
    // (The three parts keep their places in both layouts, so the map isn't reloaded on switching.)
    <div className="flex min-h-0 flex-1 flex-col">
      {today && <NowChip activities={day.activities} running={day.running} tz={day.tz} renderedAt={renderedAt} />}

      {mapMode ? null : (
        <header className="mb-3 flex items-center gap-3">
          <h1 className="min-w-0 flex-1 truncate font-display text-2xl font-semibold tracking-tight">
            {title}
            {subtitle && <span className="ml-2 text-base font-normal text-muted">{subtitle}</span>}
          </h1>
          {nav}
        </header>
      )}

      {mapMode ? null : (
        <section aria-label="The day" className="relative mb-4 shrink-0 rounded-card border-[1.5px] border-ink px-4 pb-4 pt-4 sm:px-6 sm:pb-5">
          {toggle(true)}
          <h2 className="mb-4 font-display text-lg font-semibold">The day</h2>
          {bar}
        </section>
      )}

      <div className={`relative flex flex-1 flex-col ${mapMode ? "min-h-[calc(100dvh-6rem)]" : "min-h-[26rem]"}`}>
        <DayMap
          day={day}
          focus={focus}
          onPointer={setMarks}
          gestures="greedy"
          bare={mapMode}
          // Today: where you are now pulses, in the color of what you're doing.
          liveColor={today ? ((day.running[0]?.activity_id && byId.get(day.running[0].activity_id)?.color) || "#7f5539") : null}
        />
        {/* The map layout: the title, the day before / after and the bar, floating on the map. */}
        {mapMode && (
          <div className="pointer-events-none absolute inset-x-3 top-3 z-20 sm:inset-x-5 sm:top-5">
            <section
              aria-label="The day"
              className="pointer-events-auto rounded-card bg-paper/85 px-4 pb-3 pt-3 shadow-xl shadow-ink/15 ring-1 ring-ink/10 backdrop-blur-md sm:px-5"
            >
              <div className="mb-2.5 flex items-center gap-3">
                <h1 className="min-w-0 flex-1 truncate font-display text-lg font-semibold tracking-tight">
                  {title}
                  {subtitle && <span className="ml-2 text-sm font-normal text-muted">{subtitle}</span>}
                </h1>
                {nav}
                {toggle(false)}
              </div>
              {bar}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

// The map layout on/off, kept in this browser (if storage is blocked it just isn't remembered).
const MAP_KEY = "mbm-map-mode";
const listeners = new Set<() => void>();
let fallback = false;
function readMapMode() {
  try {
    return localStorage.getItem(MAP_KEY) === "1";
  } catch {
    return fallback;
  }
}
function writeMapMode(on: boolean) {
  fallback = on;
  try {
    localStorage.setItem(MAP_KEY, on ? "1" : "0");
  } catch {
    // not remembered
  }
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

// Pinching on a trackpad (Ctrl+scroll) zooms the bar or the map, never the whole page.
function useNoPageZoom() {
  useEffect(() => {
    const noPageZoom = (e: WheelEvent) => e.ctrlKey && e.preventDefault();
    const noGesture = (e: Event) => e.preventDefault(); // Safari's pinch
    window.addEventListener("wheel", noPageZoom, { passive: false });
    document.addEventListener("gesturestart", noGesture);
    document.addEventListener("gesturechange", noGesture);
    return () => {
      window.removeEventListener("wheel", noPageZoom);
      document.removeEventListener("gesturestart", noGesture);
      document.removeEventListener("gesturechange", noGesture);
    };
  }, []);
}
