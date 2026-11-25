"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { withArrival } from "@/mbm/arrival";
import type { Day, RoutePoint, Visit } from "@/mbm/data";
import { nearOutline } from "@/mbm/buildings";
import { clock, span } from "@/mbm/time";
import { useNow } from "./useNow";

const Inner = dynamic(() => import("./DayMapInner"), { ssr: false, loading: () => <div className="size-full animate-pulse bg-surface" /> });

// Today's map for the phone app (/embed/map): the Day page's own map, still (nothing opens, no
// hover bubbles), with where you are now pulsing in the color of what's running.
// top: where the phone's clock and battery end (points), from the app.
export default function PhoneMap({ day, top }: { day: Day; top: number }) {
  const shown = useMemo(() => withArrival(day, day.loadedAt), [day]);
  const running = day.running[0]?.activity_id ? day.activities.find((a) => a.id === day.running[0].activity_id) : undefined;
  const now = useNow(day.loadedAt);
  // Where you are, up top: the stop you're at, and since when you've really been there (see stay()).
  const stayed = useMemo(() => stay(shown.visits, shown.points), [shown]);
  const [refit, setRefit] = useState(0);

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
        topCover={top + 46}
        bottomCover={84}
        refitFrom={refit}
        still
      />
      {/* Always at the top, on the app's laptop tab's line: where you are. */}
      {stayed && (
        <div className="pointer-events-none absolute left-3 right-[60px] z-40 flex h-9 justify-center" style={{ top: top + 6 }}>
          <p className="flex h-9 min-w-0 items-center whitespace-nowrap rounded-full bg-paper/95 px-3.5 text-[13px] text-ink shadow-lg shadow-ink/15 ring-1 ring-line backdrop-blur">
            {stayed.at ? (
              <>
                At&nbsp;<span className="min-w-0 truncate font-semibold">{stayed.at}</span>&nbsp;since {clock(stayed.since, shown.tz)}
              </>
            ) : (
              <>On the way since {clock(stayed.since, shown.tz)}</>
            )}
            <span className="shrink-0 text-muted">&nbsp;· {span(Math.max(0, now - +new Date(stayed.since)))}</span>
          </p>
        </div>
      )}
      {/* Back to the whole day: a tab at the right edge under the app's laptop tab, in its style. */}
      <button
        type="button"
        onClick={() => {
          setRefit((n) => n + 1);
          // (A tap you can feel: the app turns this into a haptic, see MapCard.swift.)
          (window as unknown as { webkit?: { messageHandlers?: { mbm?: { postMessage: (m: string) => void } } } }).webkit?.messageHandlers?.mbm?.postMessage("tap");
        }}
        aria-label="Show the whole day"
        className="absolute right-0 z-40 grid h-9 w-12 translate-x-1 place-items-center rounded-l-[12px] border border-line bg-surface pr-1 text-ink shadow-[-2px_2px_6px_rgba(62,40,27,0.12)] transition-[transform,background-color,color] duration-150 active:-translate-x-0.5 active:scale-90 active:bg-accent active:text-accent-ink"
        style={{ top: top + 6 + 36 + 8 }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

// Where you are, and since when you've really been there. The phone sometimes ends a stay and
// starts it again later (Home! from 12:26 AM to 12:40 AM, then again from 2:37 PM, without
// leaving), so: a stop you "left" with no moving dots since is still where you are; and back-to-back
// stays at the same place with nothing moving in between are one stay, from the first.
const key = (v: Visit) => v.placeId ?? v.place ?? null;
// (Moved away from v between those times: a dot that isn't "still" and isn't at v — inside its
// building, or within twice its accuracy of it.)
const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180;
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  return Math.hypot(x, (b.lat - a.lat) * r) * 6371000;
};
const moved = (points: RoutePoint[], v: Visit, from: number, to: number) =>
  points.some((p) => {
    const t = +new Date(p.at);
    if (t <= from || t >= to || p.motion === "still") return false;
    const at = v.outline && nearOutline(v.outline, p.lat, p.lng, 0);
    return !at && metres(v, p) > Math.max(60, 2 * (p.accuracy_m ?? 30));
  });

export function stay(visits: Visit[], points: RoutePoint[]): { at: string | null; since: string } | null {
  const vs = [...visits].sort((a, b) => +new Date(a.arrived_at) - +new Date(b.arrived_at));
  if (!vs.length) return null;
  let i = vs.findIndex((v) => !v.departed_at);
  const last = vs[vs.length - 1];
  if (i < 0) {
    // "Left" the last stop: still there if nothing's moved since.
    if (moved(points, last, +new Date(last.departed_at!), Infinity)) return { at: null, since: last.departed_at! };
    i = vs.length - 1;
  }
  while (i > 0) {
    const a = vs[i - 1];
    const b = vs[i];
    if (!key(a) || key(a) !== key(b) || !a.departed_at || moved(points, a, +new Date(a.departed_at), +new Date(b.arrived_at))) break;
    i--;
  }
  const v = vs[i];
  return { at: v.place ?? v.auto_name ?? "a stop", since: v.arrived_at };
}
