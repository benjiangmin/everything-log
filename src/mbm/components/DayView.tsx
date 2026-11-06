"use client";

import { useEffect, useState } from "react";
import type { Day } from "@/mbm/data";
import DayBar from "./DayBar";
import DayMap from "./DayMap";
import type { Focus } from "./DayMapInner";
import NowStatus from "./NowStatus";
import { openMbm } from "./open";
import { layOut } from "./segments";
import { isMoving } from "@/mbm/moving";
import { useNow } from "./useNow";

// One day: (today) what's running, the 24-hour bar, and the map. Hover an entry on the bar for
// what it was; click it to change it; add missed ones from the sidebar.
export default function DayView({ day, today, renderedAt }: { day: Day; today: boolean; renderedAt: number }) {
  const now = useNow(renderedAt);
  const dayStart = +new Date(day.start);
  const dayEnd = +new Date(day.end);
  const byId = new Map(day.activities.map((a) => [a.id, a]));
  const { placed, lanes, gaps } = layOut(day.blocks, dayStart, dayEnd, now);
  const [focus, setFocus] = useState<Focus | null>(null); // hovering the bar → lit up on the map
  const [marks, setMarks] = useState<{ start: number; end: number }[] | null>(null); // hovering the map → outlined on the bar
  const screen = useScreens(day.visits.length > 0 || day.points.length > 0);

  return (
    <div className="flex flex-col gap-5">
      {today && <NowStatus activities={day.activities} running={day.running} tz={day.tz} renderedAt={renderedAt} />}

      <section aria-label="The day" className="rounded-card border-[1.5px] border-ink px-4 pb-4 pt-4 sm:px-6 sm:pb-5">
        <h2 className="mb-4 font-display text-lg font-semibold">The day</h2>
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
      </section>

      <DayMap
        day={day}
        focus={focus}
        onPointer={setMarks}
        gestures={screen === "map" ? "greedy" : "cooperative"}
        // Today: where you are now pulses, in the color of what you're doing.
        liveColor={today ? ((day.running[0]?.activity_id && byId.get(day.running[0].activity_id)?.color) || "#7f5539") : null}
      />
      {screen && <ScreenSwitch screen={screen} />}
    </div>
  );
}

// The page has two screens: the Day (the bar) and the Map. Scrolling snaps to one or the other,
// pinching never zooms the whole page (only the bar or the map), and on the Map screen scrolling
// and pinching zoom the map. Returns which screen you're on (null: no map today, just a page).
function useScreens(hasMap: boolean): "day" | "map" | null {
  const [screen, setScreen] = useState<"day" | "map">("day");
  useEffect(() => {
    if (!hasMap) return;
    const root = document.documentElement;
    const before = root.style.scrollSnapType;
    root.style.scrollSnapType = "y mandatory";
    const update = () => {
      const map = document.querySelector<HTMLElement>('[data-screen="map"]');
      if (map) setScreen(map.getBoundingClientRect().top < window.innerHeight / 2 ? "map" : "day");
    };
    // Pinch on a trackpad (Ctrl+scroll) zooms the bar or the map, never the page.
    const noPageZoom = (e: WheelEvent) => e.ctrlKey && e.preventDefault();
    const noGesture = (e: Event) => e.preventDefault(); // Safari's pinch
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    window.addEventListener("wheel", noPageZoom, { passive: false });
    document.addEventListener("gesturestart", noGesture);
    document.addEventListener("gesturechange", noGesture);
    return () => {
      root.style.scrollSnapType = before;
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("wheel", noPageZoom);
      document.removeEventListener("gesturestart", noGesture);
      document.removeEventListener("gesturechange", noGesture);
    };
  }, [hasMap]);
  return hasMap ? screen : null;
}

function ScreenSwitch({ screen }: { screen: "day" | "map" }) {
  const go = (to: "day" | "map") => document.querySelector(`[data-screen="${to}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const tab = (to: "day" | "map", label: string) => (
    <button
      type="button"
      onClick={() => go(to)}
      aria-pressed={screen === to}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${screen === to ? "bg-paper text-ink shadow-sm" : "text-accent-ink/80 hover:text-accent-ink"}`}
    >
      {label}
    </button>
  );
  return (
    <nav aria-label="Jump to" className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 gap-1 rounded-full bg-accent p-1 shadow-xl shadow-ink/25">
      {tab("day", "Day")}
      {tab("map", "Map")}
    </nav>
  );
}
