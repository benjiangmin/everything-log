"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Day } from "@/mbm/data";
import { useRouter } from "next/navigation";
import { liftOut, tuckBetween } from "@/app/mbm/actions";
import DayBar, { type DayPlan } from "./DayBar";
import DayMap from "./DayMap";
import type { Focus } from "./DayMapInner";
import NowChip from "./NowChip";
import PlanPrompt from "./PlanPrompt";
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
  plans = [],
  today,
  renderedAt,
  title,
  subtitle,
  nav,
}: {
  day: Day;
  plans?: DayPlan[]; // still planned for later today
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
  const [pin, setPin] = useState<DayPlan | null>(null);
  const [zoomSlot, setZoomSlot] = useState<HTMLDivElement | null>(null); // (over the map: where the bar's zoom icons go) // hovering a plan on the bar → where it is, on the map
  const router = useRouter();
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
      plans={plans}
      onLift={async (b) => {
        const res = await liftOut(b.id).catch(() => ({ ok: false as const, message: "Couldn't do that. Check your connection." }));
        if (res.ok) router.refresh();
        return res.ok ? null : res.message;
      }}
      onTuck={async (b) => {
        const res = await tuckBetween(b.id).catch(() => ({ ok: false as const, message: "Couldn't do that. Check your connection." }));
        if (res.ok) router.refresh();
        return res.ok ? null : res.message;
      }}
      onHoverPlan={setPin}
      onSelectPlan={(p) => router.push(`/mbm/plan?event=${encodeURIComponent(p.id)}`)}
      phone={day.phone}
      slim={mapMode}
      zoomSlot={zoomSlot}
      onHover={(h) => {
        if (!h) {
          setFocus(null);
          setMarks(null);
          return;
        }
        // Commute → the route; anything else → where you were; untracked → either.
        const kind: Focus["kind"] = !h.block ? "any" : isMoving(h.block.activity_id ? byId.get(h.block.activity_id)?.name : null) ? "moving" : "still";
        // An entry that covers more than one stop (Work at Russell Labs, then Ag Hall): just the
        // part under the pointer, outlined on the bar, and only that place (or trip) on the map.
        // (Untracked too: the stop or trip under the pointer.)
        const part = kind !== "moving" && h.at !== undefined ? partAt(day.visits, h.at, h.start, h.end, now) : null;
        const next = part ? { start: part.start, end: part.end, kind: part.kind } : { start: h.start, end: h.end, kind };
        setFocus((f) => (f && f.start === next.start && f.end === next.end && f.kind === next.kind ? f : next));
        setMarks((m) => {
          if (!part || (part.start <= h.start + 60_000 && part.end >= h.end - 60_000)) return m === null ? m : null;
          return m && m.length === 1 && m[0].start === part.start && m[0].end === part.end ? m : [{ start: part.start, end: part.end }];
        });
      }}
      // Untracked up to right now: you're asked what you're doing (it starts from when it began).
      // Earlier untracked time: fill it in.
      splitGap={(t, g) => {
        const p = partAt(day.visits, t, g.start, g.end, now);
        return p && { start: p.start, end: p.end, where: p.where };
      }}
      onSelectGap={(g) => (g.end >= now - 60_000 ? openMbm({ kind: "now" }) : openMbm({ kind: "add", dayKey: day.dayKey, from: g.start, to: g.end }))}
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

      {today && <PlanPrompt plans={plans} now={now} tz={day.tz} />}

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
          pin={pin}
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
              data-covers-map
              className="pointer-events-auto rounded-card bg-paper/85 px-4 pb-3 pt-3 shadow-xl shadow-ink/15 ring-1 ring-ink/10 backdrop-blur-md sm:px-5"
            >
              <div className="mb-2.5 flex items-center gap-3">
                <h1 className="min-w-0 flex-1 truncate font-display text-lg font-semibold tracking-tight">
                  {title}
                  {subtitle && <span className="ml-2 text-sm font-normal text-muted">{subtitle}</span>}
                </h1>
                <div ref={setZoomSlot} />
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

// The stop you were at, at time t (inside an entry from..to): its stretch within the entry; or,
// between stops, the trip. Null when the entry only covers one of them (nothing to narrow down).
function partAt(visits: Day["visits"], t: number, from: number, to: number, now: number): (Focus & { where: string }) | null {
  const spans = visits
    .map((v) => ({ start: Math.max(from, +new Date(v.arrived_at)), end: Math.min(to, v.departed_at ? +new Date(v.departed_at) : now), where: v.place ?? v.auto_name ?? "a stop" }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);
  // (Nothing to narrow down: no stop in it, or one stop for all of it.)
  if (!spans.length || (spans.length === 1 && spans[0].start <= from + 60_000 && spans[0].end >= to - 60_000)) return null;
  const hit = spans.find((s) => s.start <= t && t < s.end);
  if (hit) return { ...hit, kind: "still" };
  const before = [...spans].reverse().find((s) => s.end <= t);
  const after = spans.find((s) => s.start > t);
  return { start: before?.end ?? from, end: after?.start ?? to, kind: "moving", where: "on the way" };
}
