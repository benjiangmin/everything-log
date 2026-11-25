"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { withArrival } from "@/mbm/arrival";
import type { Day } from "@/mbm/data";

const Inner = dynamic(() => import("./DayMapInner"), { ssr: false, loading: () => <div className="size-full animate-pulse bg-surface" /> });

// Today's map for the phone app (/embed/map): the Day page's own map, still (nothing opens, no
// hover bubbles), with where you are now pulsing in the color of what's running.
export default function PhoneMap({ day }: { day: Day }) {
  const shown = useMemo(() => withArrival(day, day.loadedAt), [day]);
  const running = day.running[0]?.activity_id ? day.activities.find((a) => a.id === day.running[0].activity_id) : undefined;
  // (Ends above the app's tab bar, so the map's "whole day" button isn't under it.)
  return (
    <div className="absolute inset-x-0 top-0 bottom-[84px]">
      <Inner
        visits={shown.visits}
        points={shown.points}
        blocks={shown.blocks}
        activities={shown.activities}
        tz={shown.tz}
        focus={null}
        liveColor={running?.color ?? "#7f5539"}
        gestures="greedy"
        dayKey={shown.dayKey}
        finished={shown.finished}
        locked={shown.locked}
        still
      />
    </div>
  );
}
