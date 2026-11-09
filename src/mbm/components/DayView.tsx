"use client";

import { useEffect, useState } from "react";
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
export default function DayView({ day, today, renderedAt }: { day: Day; today: boolean; renderedAt: number }) {
  const now = useNow(renderedAt);
  const dayStart = +new Date(day.start);
  const dayEnd = +new Date(day.end);
  const byId = new Map(day.activities.map((a) => [a.id, a]));
  const { placed, lanes, gaps } = layOut(day.blocks, dayStart, dayEnd, now);
  const [focus, setFocus] = useState<Focus | null>(null); // hovering the bar → lit up on the map
  const [marks, setMarks] = useState<{ start: number; end: number }[] | null>(null); // hovering the map → outlined on the bar
  useNoPageZoom();

  return (
    // The day bar on top and the map filling the rest of the window, so you can hover one and see
    // it on the other. Today: what's running sits in a small button in the corner (NowChip).
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {today && <NowChip activities={day.activities} running={day.running} tz={day.tz} renderedAt={renderedAt} />}
      <div className="flex min-h-[30rem] flex-1 flex-col gap-4">
        <section aria-label="The day" className="shrink-0 rounded-card border-[1.5px] border-ink px-4 pb-4 pt-4 sm:px-6 sm:pb-5">
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
            phone={day.phone}
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
          gestures="greedy"
          // Today: where you are now pulses, in the color of what you're doing.
          liveColor={today ? ((day.running[0]?.activity_id && byId.get(day.running[0].activity_id)?.color) || "#7f5539") : null}
        />
      </div>
    </div>
  );
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
