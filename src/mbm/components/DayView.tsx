"use client";

import { useState } from "react";
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
        // Today: where you are now pulses, in the color of what you're doing.
        liveColor={today ? ((day.running[0]?.activity_id && byId.get(day.running[0].activity_id)?.color) || "#7f5539") : null}
      />
    </div>
  );
}
