"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { withArrival } from "@/mbm/arrival";
import type { Day } from "@/mbm/data";
import { clock, span } from "@/mbm/time";
import { useNow } from "./useNow";

const Inner = dynamic(() => import("./DayMapInner"), { ssr: false, loading: () => <div className="size-full animate-pulse bg-surface" /> });

// Today's map for the phone app (/embed/map): the Day page's own map, still (nothing opens, no
// hover bubbles), with where you are now pulsing in the color of what's running.
export default function PhoneMap({ day }: { day: Day }) {
  const shown = useMemo(() => withArrival(day, day.loadedAt), [day]);
  const running = day.running[0]?.activity_id ? day.activities.find((a) => a.id === day.running[0].activity_id) : undefined;
  const now = useNow(day.loadedAt);
  // Where you are, up top: the stop you're at (and since when), or on the way since you left one.
  const here = shown.visits.find((v) => !v.departed_at);
  const left = here ? null : shown.visits.reduce<string | null>((t, v) => (v.departed_at && (!t || v.departed_at > t) ? v.departed_at : t), null);
  const since = here?.arrived_at ?? left;
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
      {since && (
        <div className="pointer-events-none absolute inset-x-0 top-[52px] z-20 flex justify-center px-16">
          <p className="max-w-full truncate rounded-full bg-paper/95 px-4 py-2 text-sm text-ink shadow-lg shadow-ink/15 ring-1 ring-line backdrop-blur">
            {here ? (
              <>
                At <span className="font-semibold">{here.place ?? here.auto_name ?? "a stop"}</span> since {clock(since, shown.tz)}
              </>
            ) : (
              <>On the way since {clock(since, shown.tz)}</>
            )}
            <span className="text-muted"> · {span(Math.max(0, now - +new Date(since)))}</span>
          </p>
        </div>
      )}
    </div>
  );
}
