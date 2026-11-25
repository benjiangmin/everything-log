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
  // (The whole screen; the app's tab bar floats over the bottom, so the day fits above it, and the
  // "whole day" button sits above it. The top: the phone's clock and battery.)
  return (
    <div className="absolute inset-0">
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
        topCover={44}
        bottomCover={84}
        still
      />
    </div>
  );
}
