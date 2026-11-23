"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import type { Activity, Block, PhoneUse } from "@/mbm/data";
import { clock, span, zonedTime } from "@/mbm/time";
import type { Placed } from "./segments";
import { retimeBlocks } from "@/app/mbm/actions";
import { undoable } from "@/mbm/undo";

// Something still planned for later today (Google Calendar, or the Plan tab): shown dashed in the
// part of the day that hasn't happened yet. at: where it is, when known (lit up on the map).
export type DayPlan = { id: string; title: string; start: number; end: number; location: string | null; at: { lat: number; lng: number } | null };

// The whole day (midnight to midnight) as one bar: each entry in its activity's color, untracked
// time striped, the rest of today plain, and a line at "now". Overlapping entries stack in rows.
// Hover an entry for what it was; click it to change it; drag either end of it to change its
// times (it snaps to round times, and to the entries next to it).
// On the day page (not compact) you can zoom in: pinch or Ctrl+scroll over the bar, or the − / +
// buttons. Drag (or scroll sideways) to move around. The time marks get finer as you zoom.
export default function DayBar({
  placed,
  gaps,
  dayKey,
  dayStart,
  dayEnd,
  now,
  tz,
  byId,
  onSelect,
  onSelectGap,
  splitGap,
  onHover,
  marks = null,
  spotlight = null,
  phone = [],
  compact = false,
  slim = false,
  zoomSlot = null,
  plans = [],
  onTuck,
  onLift,
  onSelectPlan,
  onHoverPlan,
}: {
  plans?: DayPlan[];
  onTuck?: (b: Block) => Promise<string | null>; // (a problem, or null) a sandwiched entry (Work, Coffee, Work): under one joined Work
  onLift?: (b: Block) => Promise<string | null>; // …and back up again (the job cut around it)
  onSelectPlan?: (p: DayPlan) => void; // click: change it on the Plan tab
  onHoverPlan?: (p: DayPlan | null) => void; // hover: where it is, on the map
  placed: Placed[];
  lanes: number;
  gaps: { start: number; end: number }[]; // untracked: nothing at all going on

  dayKey: string;
  dayStart: number;
  dayEnd: number;
  now: number;
  tz: string;
  byId: Map<string, Activity>;
  onSelect?: (b: Block) => void;
  onSelectGap?: (gap: { start: number; end: number }) => void; // click untracked time to fill it in
  // An untracked stretch over more than one stop: the part at time t (where you were, or a trip),
  // so pointing along it shows and fills in just that part.
  splitGap?: (t: number, gap: { start: number; end: number }) => { start: number; end: number; where: string } | null;
  onHover?: (span: { start: number; end: number; block?: Block; at?: number } | null) => void; // at: the time under the pointer
  marks?: { start: number; end: number }[] | null; // outlined (what you're hovering on the map) // what's hovered (the map lights it up)
  spotlight?: { spans: { start: number; end: number }[]; ms: number } | null; // (from a stats tile: zoomed to fit, flashed, then fades)
  phone?: PhoneUse[]; // apps you used (a thin line under the bar)
  compact?: boolean; // the home page's smaller version
  slim?: boolean; // the day page with the map opened up: a shorter bar, no zoom row
  zoomSlot?: HTMLElement | null; // (slim) where the zoom icons go: the box's header
}) {
  // Just left the row under: the hover clears in half a second, unless you point at something
  // first (e.g. its ↑, past a small gap).
  const [leftRow, setLeftRow] = useState(false);
  // What the bubble is about: an entry, or an untracked stretch.
  const [hover, setHoverState] = useState<{ start: number; end: number; block?: Block; phone?: PhoneUse; plan?: DayPlan } | null>(null);
  // (The latest onHover, so a re-render doesn't restart the half second.)
  const tellHover = useRef(onHover);
  useEffect(() => {
    tellHover.current = onHover;
  });
  useEffect(() => {
    if (!leftRow) return;
    const t = setTimeout(() => {
      setLeftRow(false);
      setHoverState(null);
      tellHover.current?.(null);
    }, 500);
    return () => clearTimeout(t);
  }, [leftRow]);
  const setHover = (h: { start: number; end: number; block?: Block } | null) => {
    // (Pointing at something new: a pending "clear" from leaving the row under mustn't wipe it.)
    if (h) setLeftRow(false);
    if (hover?.plan) onHoverPlan?.(null);
    setHoverState(h);
    onHover?.(h && { start: h.start, end: h.end, block: h.block });
  };
  const hoverPlan = (p: DayPlan) => {
    onHover?.(null);
    setHoverState({ start: p.start, end: p.end, plan: p });
    onHoverPlan?.(p);
  };
  const total = dayEnd - dayStart;
  const zoomable = !compact;
  // The part of the day on screen. Whole day unless zoomed in.
  const [view, setView] = useState<[number, number]>([dayStart, dayEnd]);
  // "Now": zoomed in on the last 2 hours and the next one, moving along as the time does. Any
  // zooming or dragging of your own stops it following.
  // (Today opens zoomed in on now; another day, on the whole day.)
  const live = now > dayStart && now < dayEnd;
  const [follow, setFollow] = useState(live);
  const followed: [number, number] = (() => {
    const len = Math.min(dayEnd - dayStart, 3 * 3600_000);
    const start = Math.min(dayEnd - len, Math.max(dayStart, now - 2 * 3600_000));
    return [start, start + len];
  })();
  const [from, to] = zoomable ? (follow && live ? followed : view) : [dayStart, dayEnd];
  const shown = to - from;
  const zoomed = shown < total - 1000;
  const at = (t: number) => ((t - from) / shown) * 100;
  const showNow = now > from && now < to;

  // Keep the view inside the day, no closer than 10 minutes.
  const fit = (a: number, b: number): [number, number] => {
    const len = Math.min(total, Math.max(MIN_VIEW, b - a));
    const start = Math.min(dayEnd - len, Math.max(dayStart, a));
    return [start, start + len];
  };
  // The zoom icons glide from one view to the other (pinching and dragging don't: they follow
  // your hand). Instant with reduced motion.
  const glide = useRef(0);
  const glideTo = (target: [number, number], then?: () => void) => {
    cancelAnimationFrame(glide.current);
    const start: [number, number] = [from, to];
    setFollow(false);
    setView(start);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) {
      setView(target);
      then?.();
      return;
    }
    const t0 = performance.now();
    const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const step = (t: number) => {
      const k = ease(Math.min(1, (t - t0) / 380));
      setView([start[0] + (target[0] - start[0]) * k, start[1] + (target[1] - start[1]) * k]);
      if (k < 1) glide.current = requestAnimationFrame(step);
      else then?.();
    };
    glide.current = requestAnimationFrame(step);
  };
  // (Zooming or moving it yourself: it stops following now, from where it is.)
  const takeOver = () => {
    cancelAnimationFrame(glide.current);
    if (!follow) return;
    setFollow(false);
    setView([from, to]);
  };
  const zoomAround = (factor: number, frac = 0.5) => {
    takeOver();
    setView(([a, b]) => {
      const len = b - a;
      const pivot = a + len * frac;
      return fit(pivot - (pivot - a) * factor, pivot + (b - pivot) * factor);
    });
  };

  // Arriving from a stats tile: glide out (or in) to fit everything it's about, with a little room.
  useEffect(() => {
    if (!spotlight?.spans.length || !zoomable) return;
    const a = Math.min(...spotlight.spans.map((x) => x.start));
    const b = Math.max(...spotlight.spans.map((x) => x.end));
    const pad = Math.max(10 * 60_000, (b - a) * 0.08);
    const id = setTimeout(() => glideTo(fit(a - pad, b + pad)), 150);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, [spotlight]);

  // Pinch / Ctrl+scroll zooms around the pointer; sideways scroll pans. A plain scroll still
  // scrolls the page. (Needs a non-passive listener so the browser doesn't zoom the page too.)
  const barRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // The edges of what the pointer is over (in the bar's box), for the bubble's line.
  // (up/down: room on screen above and below it, past the top bar, so the bubble picks a side it fits.)
  const [anchor, setAnchor] = useState<{ top: number; bottom: number; h: number; up: number; down: number } | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const bubbleH = useRef(110); // (the last bubble's height: a fair guess for the next)
  const anchorEl = useRef<HTMLElement | null>(null); // (what it points at)
  // Where the bubble's thing is, and the room around it on screen right now.
  const measure = () => {
    const w = wrapRef.current;
    const el = anchorEl.current;
    if (!w || !el?.isConnected) return;
    const r = el.getBoundingClientRect();
    const box = w.getBoundingClientRect();
    if (bubbleRef.current) bubbleH.current = bubbleRef.current.offsetHeight;
    const cover = document.querySelector("header[data-covers-map]")?.getBoundingClientRect().bottom ?? 0;
    const need = bubbleH.current + 40 + 8;
    setAnchor({ top: r.top - box.top, bottom: r.bottom - box.top, h: box.height, up: r.top - Math.max(0, cover) - need, down: window.innerHeight - r.bottom - need });
  };
  // While a bubble is up: measured again once it's drawn (its real height), and as the page
  // scrolls or resizes, so it never ends up under the top bar or off the screen.
  useEffect(() => {
    if (!hover) return;
    const frame = requestAnimationFrame(measure);
    window.addEventListener("scroll", measure, { passive: true, capture: true });
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
    };
  }, [hover]);

  const [barWidth, setBarWidth] = useState(1000); // in px (for chips: see pill)
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBarWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const el = barRef.current;
    if (!el || !zoomable) return;
    const onWheel = (e: WheelEvent) => {
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        zoomAround(Math.exp(Math.max(-0.25, Math.min(0.25, e.deltaY * 0.01))), frac);
        return;
      }
      // Sideways (trackpad swipe, or Shift+scroll) moves around while zoomed in.
      const dx = e.shiftKey ? e.deltaY : e.deltaX;
      if (!zoomed || Math.abs(dx) <= Math.abs(e.shiftKey ? 0 : e.deltaY)) return;
      e.preventDefault();
      takeOver();
      const move = (dx / rect.width) * shown;
      setView(fit(from + move, to + move));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  // Drag to move around while zoomed in (a drag never counts as a click on an entry).
  const drag = useRef<{ x: number; view: [number, number]; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const onPointerDown = (e: PointerEvent) => {
    if (!zoomed || e.button !== 0) return;
    drag.current = { x: e.clientX, view: [from, to], moved: false };
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || !barRef.current) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 4) return;
    if (!d.moved) {
      d.moved = true;
      takeOver();
      barRef.current.setPointerCapture(e.pointerId);
      setHover(null);
    }
    const move = -(dx / barRef.current.getBoundingClientRect().width) * (d.view[1] - d.view[0]);
    setView(fit(d.view[0] + move, d.view[1] + move));
  };
  const onPointerUp = () => {
    dragged.current = Boolean(drag.current?.moved);
    drag.current = null;
  };

  // ---------- Dragging an entry's edge to change its time ----------
  // linked: (no longer used: only the entry you grab moves.)
  type Edge = { id: string; side: "start" | "end"; linked: { id: string; side: "start" | "end" } | null; min: number; max: number; at: number; orig: number };
  const [edge, setEdge] = useState<Edge | null>(null);
  // Saved changes, shown until the page's data catches up (was: the entry's times before).
  const [moves, setMoves] = useState<Record<string, { start: number; end: number; was: string }>>({});
  const [edgeError, setEdgeError] = useState<string | null>(null);
  const resizable = !compact && Boolean(onSelect);
  const MIN = 60000;

  function withMoves(p: Placed): Placed {
    let { start, end } = p;
    const m = moves[p.block.id];
    if (m && m.was === `${p.start}-${p.end}`) ({ start, end } = m);
    if (edge) {
      const side = edge.id === p.block.id ? edge.side : edge.linked?.id === p.block.id ? edge.linked.side : null;
      if (side === "start") start = edge.at;
      if (side === "end") end = edge.at;
    }
    return start === p.start && end === p.end ? p : { ...p, start, end };
  }

  const beginEdge = (e: PointerEvent, p: Placed, side: "start" | "end") => {
    if (e.button !== 0) return;
    e.stopPropagation(); // (not a pan)
    e.preventDefault();
    // Only the entry you grab moves: the one next to it stays where it is (they can overlap;
    // the bar stacks overlapping entries).
    const linked: Edge["linked"] = null;
    const min = side === "end" ? p.start + MIN : dayStart;
    const max = side === "end" ? Math.min(now, dayEnd) : p.end - MIN;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setHover(null);
    setEdgeError(null);
    const orig = side === "start" ? p.start : p.end;
    setEdge({ id: p.block.id, side, linked, min, max, at: orig, orig });
  };

  // Where the pointer is, snapped: to the edges of other entries and "now" first, then to round
  // times (finer as you zoom in), within ~10 px; otherwise to the minute.
  const snap = (raw: number, e: Edge) => {
    const width = barRef.current?.getBoundingClientRect().width ?? 1;
    const near = (10 / width) * shown;
    const skip = new Set([e.id, e.linked?.id]);
    const edges = [now, ...placed.filter((q) => !skip.has(q.block.id)).flatMap((q) => [q.start, q.end])];
    const best = edges.reduce((b, t) => (Math.abs(t - raw) < Math.abs(b - raw) ? t : b), Infinity);
    if (Math.abs(best - raw) <= near) return best;
    const g = (shown <= 2 * 3600000 ? 5 : shown <= 8 * 3600000 ? 15 : 30) * 60000;
    const grid = dayStart + Math.round((raw - dayStart) / g) * g;
    if (Math.abs(grid - raw) <= near) return grid;
    return dayStart + Math.round((raw - dayStart) / 60000) * 60000;
  };

  const moveEdge = (e: PointerEvent) => {
    if (!edge || !barRef.current) return;
    const r = barRef.current.getBoundingClientRect();
    const raw = from + ((e.clientX - r.left) / r.width) * shown;
    const t = Math.min(edge.max, Math.max(edge.min, snap(raw, edge)));
    if (t !== edge.at) setEdge({ ...edge, at: t });
  };

  const endEdge = () => {
    const e = edge;
    if (!e) return;
    dragged.current = true; // (so letting go isn't a click that opens the entry)
    setEdge(null);
    if (Math.abs(e.at - e.orig) < 30000) return;
    const iso = new Date(e.at).toISOString();
    const changes = [{ id: e.id, [e.side]: iso }, ...(e.linked ? [{ id: e.linked.id, [e.linked.side]: iso }] : [])];
    const next = { ...moves };
    for (const c of changes) {
      const p = placed.find((q) => q.block.id === c.id);
      if (!p) continue;
      next[c.id] = { start: "start" in c ? e.at : p.start, end: "end" in c ? e.at : p.end, was: `${p.start}-${p.end}` };
    }
    setMoves(next);
    undoable(dayKey, "Move an edge", () => retimeBlocks(changes)).then((res) => {
      if (res.ok) return;
      setMoves((m) => {
        const back = { ...m };
        for (const c of changes) delete back[c.id];
        return back;
      });
      setEdgeError(res.message);
    });
  };

  // Time marks for what's on screen: labels and faint lines, finer as you zoom in. Placed by
  // the real clock time, so daylight-saving days still line up.
  const { labels, lines } = marksFor(dayKey, tz, dayStart, dayEnd, from, to);
  // The bar: your main entries as rounded pills with small gaps between them. Something running
  // alongside (+ Start) goes in a thin strip under the bar instead of squashing it.
  const height = compact ? 48 : slim ? 40 : 64;
  const shownPlaced = placed.map(withMoves);
  const shownPlans = plans.filter((p) => p.end > now && p.start < dayEnd && p.end > from && p.start < to);
  const main = shownPlaced.filter((p) => p.lane === 0);
  const side = shownPlaced.filter((p) => p.lane > 0);
  // Sandwiched: hovering it shows a ↓, and the two around it become one with it under them
  // (tuck_between, 052).
  const sandwich = new Map<string, Block>(); // middle's id → the entry before it
  // Only directly between two of the same job: the entry right before it ends as it starts, and
  // the one right after starts as it ends (a minute's slack), with nothing else in between.
  // (Work, Coffee, Work: yes. Work, Commute, Church, Commute, …, Work: no.) Never under a Commute.
  main.forEach((p, i) => {
    if (!p.block.ended_at || !p.block.activity_id) return;
    const b = main[i - 1];
    const a = main[i + 1];
    if (!b || !a) return;
    const job = b.block.activity_id;
    if (!job || job === p.block.activity_id || a.block.activity_id !== job) return;
    if (b.block.source === "location" || byId.get(job)?.name === "Commute" || !b.block.ended_at) return;
    if (p.start - b.end > 60_000 || a.start - p.end > 60_000) return;
    sandwich.set(p.block.id, b.block);
  });
  // Under a job (on a row below, all of it inside one entry above): hovering it shows a ↑ that
  // brings it back up and cuts the job around it (lift_out).
  const under = new Map<string, Block>(); // its id → the entry it's under
  side.forEach((p) => {
    if (!p.block.ended_at) return;
    const w = main.find((m) => m.block.source !== "location" && m.block.activity_id !== p.block.activity_id && m.start < p.start && m.end > p.end);
    if (w) under.set(p.block.id, w.block);
  });
  const sideRows = Math.max(0, ...side.map((p) => p.lane));
  // Left / width of a pill, with a 1px gap each side. Something too short to see (a 2-minute
  // Commute on the whole day) becomes a small chip centred on its time, so it's still there.
  const tiny = (start: number, end: number) => ((at(end) - at(start)) / 100) * barWidth < TINY_PX;
  const pill = (start: number, end: number) => {
    const l = at(start);
    const w = at(end) - l;
    if (tiny(start, end)) return { left: `calc(${l + w / 2}% - ${TINY_PX / 2}px)`, width: `${TINY_PX}px` };
    return { left: `calc(${l}% + 1px)`, width: `max(calc(${w}% - 2px), 2px)` };
  };

  const nameOf = (b: Block) => (b.activity_id ? byId.get(b.activity_id) : undefined);
  // The part of an untracked stretch under the pointer (see splitGap).
  const [gapPart, setGapPart] = useState<{ start: number; end: number; where: string } | null>(null);
  const timeAtX = (x: number) => {
    const r = barRef.current!.getBoundingClientRect();
    return from + ((x - r.left) / r.width) * shown;
  };
  const pointGap = (x: number, g: { start: number; end: number }) => {
    if (!barRef.current || edge) return;
    // (Moving over it, its bubble is up, even if "entering" was missed, e.g. the bar redrew under
    // a pointer that never moved off it.)
    if (hover?.block || hover?.plan || hover?.phone || hover?.start !== g.start || hover?.end !== g.end) setHover(g);
    const t = timeAtX(x);
    const part = splitGap?.(t, g) ?? null;
    setGapPart((p) => (p && part && p.start === part.start && p.end === part.end ? p : part));
    onHover?.({ start: g.start, end: g.end, at: t });
  };
  // The time under the pointer, as it moves along an entry (one entry can cover two places: the
  // map lights up the one you were at then).
  const pointAt = (x: number, p: Placed) => {
    const el = barRef.current;
    if (edge) return;
    if (hover?.block?.id !== p.block.id) setHover(p); // (see pointGap)
    if (!onHover || !el) return;
    const r = el.getBoundingClientRect();
    onHover({ start: p.start, end: p.end, block: p.block, at: from + ((x - r.left) / r.width) * shown });
  };
  // One entry: hover for what it was, click to change it.
  // (A plain function, not a component, so the pills aren't re-made on every hover.)
  const entry = (p: Placed, style: CSSProperties, round: string, handles = false) => {
    const a = nameOf(p.block);
    // Grab either end to change its time (not an end that's off this day, or "now" while running).
    const wide = at(p.end) - at(p.start) > 1.2;
    // (Commutes come from your location, so they stay put: no handles.)
    const fixed = a?.name === "Commute" || p.block.source === "location";
    const startOk = handles && !fixed && wide && +new Date(p.block.started_at) >= dayStart;
    const endOk = handles && !fixed && wide && p.block.ended_at !== null && +new Date(p.block.ended_at) <= dayEnd;
    const grip = (side: "start" | "end") => (
      <span
        aria-hidden="true"
        onPointerDown={(e) => beginEdge(e, p, side)}
        onPointerMove={moveEdge}
        onPointerUp={endEdge}
        onPointerCancel={endEdge}
        onClick={(e) => e.stopPropagation()}
        className={`absolute inset-y-0 w-2.5 cursor-ew-resize touch-none ${side === "start" ? "left-0" : "right-0"} after:absolute after:inset-y-[28%] after:w-[3px] after:rounded-full after:bg-paper/0 after:transition-colors group-hover:after:bg-paper/85 ${
          side === "start" ? "after:left-[3px]" : "after:right-[3px]"
        } ${edge && edge.id === p.block.id && edge.side === side ? "after:bg-paper" : ""}`}
      />
    );
    const label = `${a?.name ?? "Something"}, ${clock(new Date(p.start), tz)} to ${p.block.ended_at ? clock(new Date(p.end), tz) : "now"}`;
    const chip = tiny(p.start, p.end);
    const cls = `group absolute ${chip ? "z-[15] rounded-full ring-2 ring-paper" : round} transition-[filter,box-shadow] ${p.block.confirmed ? "" : "opacity-60"} ${
      hover?.block?.id === p.block.id ? "shadow-md brightness-110" : ""
    }`;
    const look = { ...style, background: a?.color ?? "#a98467" };
    return onSelect ? (
      <button
        key={p.block.id}
        type="button"
        aria-label={label}
        onMouseEnter={() => setHover(p)}
        onMouseMove={(e) => pointAt(e.clientX, p)}
        onFocus={() => setHover(p)}
        onBlur={() => setHover(null)}
        onClick={() => onSelect(p.block)}
        className={cls}
        style={look}
      >
        {startOk && grip("start")}
        {endOk && grip("end")}
      </button>
    ) : (
      <div key={p.block.id} aria-label={label} onMouseEnter={() => setHover(p)} className={cls} style={look} />
    );
  };
  // Phone use on screen, cut to the day. Everything counts in the stats; on the bar, a use shorter
  // than a minute shows only once you've zoomed in far enough for it to be a visible sliver
  // (~0.3% of the bar's width).
  const phoneShown = phone
    .filter((u) => u.kind === "app")
    .map((u) => ({ ...u, start: Math.max(dayStart, +new Date(u.started_at)), end: Math.min(dayEnd, u.ended_at ? +new Date(u.ended_at) : now) }))
    .filter((u) => u.end > u.start && u.end > from && u.start < to)
    .filter((u) => u.end - u.start >= 60_000 || (u.end - u.start) / (to - from) >= 0.003);
  // Middle of the part of it that's on screen.
  const hoverMid = hover ? at((Math.max(hover.start, from) + Math.min(hover.end, to)) / 2) : 0;
  // The bubble sits over the tail, sliding sideways near the ends so it stays on screen
  // (the tail is always inside it).
  const slide = Math.min(90, Math.max(10, hoverMid));
  // Over the map (slim) the bar is near the top of the screen, and the apps line is under the
  // bar: there the bubble goes below instead of above.
  // Either way, it goes to the other side if it wouldn't fit on screen (and the other side would).
  const below = anchor
    ? slim || !!hover?.phone
      ? anchor.down >= 0 || anchor.down >= anchor.up
      : anchor.up < 0 && anchor.down > anchor.up
    : slim || !!hover?.phone;
  // Where the line meets what you're pointing at: right at its top edge (bubble above) or its
  // bottom edge (below), measured from the thing itself. (Keyboard focus: the bar's edge.)
  const LINE = 40; // (the bubble's stalk: it sits a little way out from the bar)
  const pos = anchor
    ? below
      ? { bubble: { top: anchor.bottom + LINE }, line: { top: anchor.bottom, height: LINE }, dot: { top: anchor.bottom } }
      : { bubble: { bottom: anchor.h - (anchor.top - LINE) }, line: { top: anchor.top - LINE, height: LINE }, dot: { top: anchor.top } }
    : null;

  // Two ways to look, as two icons: zoomed in on now (following it; on another day, just in a
  // step), or the whole day.
  const lens = (plus: boolean) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2.2" />
      <path d="M15.5 15.5L20 20M7.5 10.5h6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      {plus && <path d="M10.5 7.5v6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />}
    </svg>
  );
  const zoomTo = (
    <span role="group" aria-label="Zoom" className="flex items-center gap-0.5 rounded-full bg-surface p-0.5 text-muted">
      <button
        type="button"
        aria-pressed={follow}
        aria-label={live ? "Zoom in on now" : "Zoom in"}
        title={live ? "Zoom in on now (moves along with the time)" : "Zoom in"}
        disabled={!live && shown <= MIN_VIEW}
        onClick={() => {
          if (live) return glideTo(followed, () => setFollow(true));
          const pivot = (from + to) / 2;
          glideTo(fit(pivot - (to - from) / 4, pivot + (to - from) / 4));
        }}
        className={`grid size-7 place-items-center rounded-full transition-colors disabled:opacity-40 ${follow ? "bg-paper text-ink shadow-sm" : "hover:text-ink"}`}
      >
        {lens(true)}
      </button>
      <button
        type="button"
        aria-pressed={!follow && !zoomed}
        aria-label="Zoom out to the whole day"
        title="Whole day"
        onClick={() => glideTo([dayStart, dayEnd])}
        className={`grid size-7 place-items-center rounded-full transition-colors ${!follow && !zoomed ? "bg-paper text-ink shadow-sm" : "hover:text-ink"}`}
      >
        {lens(false)}
      </button>
    </span>
  );

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseOver={(e) => {
        const w = wrapRef.current;
        if (!w) return;
        // Only something you can point at moves the bubble (an entry, untracked time, a plan, the
        // apps line): not the space around them, and not the ↓/↑, so it stays put.
        const t = e.target as HTMLElement;
        if (t.closest("[data-tuck]")) return;
        const el = t.closest<HTMLElement>("button, [data-anchor]");
        if (!el) return;
        anchorEl.current = el;
        measure();
      }}
    >
      {/* Dragging an edge: the time it'll be. */}
      {edge && (
        <div
          aria-live="polite"
          className="num pointer-events-none absolute bottom-full z-40 mb-2 -translate-x-1/2 whitespace-nowrap rounded-control bg-accent px-2.5 py-1 text-xs font-semibold text-accent-ink shadow-lg"
          style={{ left: `${Math.min(95, Math.max(5, at(edge.at)))}%` }}
        >
          {edge.side === "start" ? "Starts" : "Ends"} {clock(new Date(edge.at), tz)}
          {edge.linked && <span className="font-normal opacity-70"> · and the one next to it</span>}
        </div>
      )}
      {/* The bubble over the bar: what it was, when, for how long. It floats well above the bar
          (over the box's top edge), joined to the entry by a line. */}
      {hover && !edge && (
        <div
          ref={bubbleRef}
          role="tooltip"
          className={`pointer-events-none absolute z-30 w-max min-w-[11rem] ${hover.plan || hover.phone || hover.block ? "max-w-[20rem]" : ""} ${pos ? "" : below ? "top-full mt-7" : "bottom-full mb-7"} rounded-card bg-accent px-4 py-3 text-accent-ink shadow-xl shadow-ink/30`}
          style={{ left: `${hoverMid}%`, transform: `translateX(-${slide}%)`, ...pos?.bubble }}
        >
          {hover.plan ? (
            <>
              <p className="font-display text-base font-semibold">{hover.plan.title || "Untitled"}</p>
              <p className="num mt-0.5 text-sm opacity-80">
                Planned · {clock(new Date(hover.plan.start), tz)} – {clock(new Date(hover.plan.end), tz)}
              </p>
              {hover.plan.location && <p className="mt-1 line-clamp-2 text-sm opacity-80">{hover.plan.location}</p>}
              {hover.plan.start < now && (
                <p className="mt-1 text-xs opacity-80">{hover.plan.at ? "Starts by itself when you get there." : "Not started yet."}</p>
              )}
              {onSelectPlan && <p className="mt-1 text-xs opacity-70">Click to change it on Plan</p>}
            </>
          ) : hover.phone ? (
            <>
              <p className="font-display text-base font-semibold">{hover.phone.kind === "app" ? (hover.phone.app ?? "An app") : "On your phone"}</p>
              <p className="num mt-0.5 text-sm opacity-80">
                {clock(new Date(hover.start), tz)} – {hover.phone.ended_at ? clock(new Date(hover.end), tz) : "now"} · {span(hover.end - hover.start)}
              </p>
            </>
          ) : hover.block ? (
            <>
              <p className="flex items-center gap-2 font-display text-base font-semibold">
                <span className="size-2.5 shrink-0 rounded-full ring-1 ring-accent-ink/40" style={{ background: nameOf(hover.block)?.color ?? "#a98467" }} />
                <span className="min-w-0">
                  {nameOf(hover.block)?.name ?? "Something"}
                  {hover.block.note && <span className="ml-2 font-sans text-sm font-normal italic opacity-60">{hover.block.note}</span>}
                </span>
              </p>
              <p className="num mt-0.5 text-sm opacity-80">
                {clock(hover.block.started_at, tz)} – {hover.block.ended_at ? clock(hover.block.ended_at, tz) : "now"} ·{" "}
                {span((hover.block.ended_at ? +new Date(hover.block.ended_at) : now) - +new Date(hover.block.started_at))}
              </p>
              {onLift && under.has(hover.block.id) && (
                <p className="mt-1 text-xs opacity-70">↑ Back up: split {nameOf(under.get(hover.block.id)!)?.name} around it</p>
              )}
              {onTuck && sandwich.has(hover.block.id) && (
                <p className="mt-1 text-xs opacity-70">↓ Put it under {nameOf(sandwich.get(hover.block.id)!)?.name}, as one {nameOf(sandwich.get(hover.block.id)!)?.name}</p>
              )}
            </>
          ) : (
            <>
              {(() => {
                // Pointing at one part of a stretch over several places: that part.
                const part = gapPart && gapPart.start >= hover.start - 1000 && gapPart.end <= hover.end + 1000 ? gapPart : null;
                const s = part ?? hover;
                return (
                  <>
                    {/* (One line, however long the place's name; then the times.) */}
                    <p className="whitespace-nowrap font-display text-base font-semibold">Untracked{part ? <span className="font-normal opacity-80"> · {part.where}</span> : null}</p>
                    <p className="num mt-0.5 text-sm opacity-80">
                      {clock(new Date(s.start), tz)} – {clock(new Date(s.end), tz)} · {span(s.end - s.start)}
                    </p>
                  </>
                );
              })()}
            </>
          )}
        </div>
      )}
      {/* The line from the bubble down to the entry, ending in a dot on the bar's edge (the
          bubble slides to stay on screen; the line always points right at the entry). */}
      {hover && !edge && (
        <>
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute z-30 w-[2px] -translate-x-1/2 bg-accent ${pos ? "" : below ? "top-full h-7" : "bottom-full h-7"}`}
            style={{ left: `${hoverMid}%`, ...pos?.line }}
          />
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute z-30 size-2.5 -translate-x-1/2 rounded-full bg-accent ring-2 ring-paper ${pos ? "-translate-y-1/2" : below ? "top-full -translate-y-1/2" : "bottom-full translate-y-1/2"}`}
            style={{ left: `${hoverMid}%`, ...pos?.dot }}
          />
        </>
      )}

      <div
        ref={barRef}
        className={`relative overflow-hidden rounded-control bg-paper ring-1 ring-line ${zoomed ? "cursor-grab touch-pan-y active:cursor-grabbing" : ""}`}
        style={{ height, transition: "height 250ms cubic-bezier(0.22,1,0.36,1)" }}
        onMouseLeave={() => setHover(null)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={(e) => {
          if (!dragged.current) return;
          dragged.current = false;
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        {/* Everything sits 3px in from the bar's edge on all sides, so the pills never touch it
            (their corners follow the bar's: 12px outside, 9px inside). */}
        <div className="absolute inset-[3px]">
        {/* Untracked: striped, full height. The rest of today (not happened yet): plain. */}
        {gaps.map((g) => {
          const cls = "absolute inset-y-0 rounded-[9px] bg-[repeating-linear-gradient(135deg,var(--line)_0_6px,transparent_6px_12px)] bg-paper";
          const style = pill(g.start, g.end);
          return onSelectGap ? (
            <button
              key={g.start}
              type="button"
              aria-label={`Untracked, ${clock(new Date(g.start), tz)} to ${clock(new Date(g.end), tz)}. Fill it in`}
              onMouseEnter={() => {
                setGapPart(null);
                setHover(g);
              }}
              onMouseMove={(e) => pointGap(e.clientX, g)}
              onFocus={() => setHover(g)}
              onBlur={() => setHover(null)}
              onClick={(e) => {
                // (Just the part you're pointing at, when the stretch covers more than one place.)
                const part = splitGap?.(timeAtX(e.clientX), g);
                onSelectGap(part ? { start: part.start, end: part.end } : g);
              }}
              className={`${cls} transition-[filter] hover:brightness-95`}
              style={style}
            />
          ) : (
            <div key={g.start} aria-hidden="true" onMouseEnter={() => setHover(g)} className={cls} style={style} />
          );
        })}
        {now < dayEnd && <div className="absolute inset-y-0 right-0 bg-paper" style={{ left: `${Math.max(0, at(now))}%` }} />}
        {/* Still planned: dashed, in what's left of the day. One whose time has come but hasn't
            started (you're not there yet, or haven't said Start): the box covers what's left of it,
            and a dashed line along the top goes back to when it was meant to start. */}
        {shownPlans.map((p) => {
          const late = p.start < now;
          const from0 = late ? now : p.start;
          const w = ((at(p.end) - at(from0)) / 100) * barWidth;
          const on = hover?.plan?.id === p.id;
          return (
            <span key={p.id} className="contents">
              {late && (
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute top-0 z-[11] h-0 border-t-2 border-dashed ${on ? "border-ink" : "border-ink/35"}`}
                  style={{ left: `${at(p.start)}%`, width: `${at(now) - at(p.start)}%` }}
                />
              )}
              <button
                type="button"
                aria-label={`Planned: ${p.title || "Untitled"}, ${clock(new Date(p.start), tz)} to ${clock(new Date(p.end), tz)}. Change it on Plan`}
                onMouseEnter={() => hoverPlan(p)}
                onFocus={() => hoverPlan(p)}
                onBlur={() => setHover(null)}
                onClick={() => onSelectPlan?.(p)}
                className={`absolute inset-y-0 overflow-hidden rounded-[8px] border-2 border-dashed px-1.5 text-left transition-colors ${
                  on ? "border-ink bg-ink/10" : "border-ink/35 bg-paper hover:border-ink/60"
                }`}
                style={pill(from0, p.end)}
              >
                {w > 44 && !compact && (
                  <span className="pointer-events-none block truncate text-[11px] font-semibold leading-tight text-ink/70">
                    {p.title || "Untitled"}
                    {late && <span className="block font-normal opacity-80">{p.at ? "when you get there" : "not started"}</span>}
                  </span>
                )}
              </button>
            </span>
          );
        })}
        {main.map((p) => entry(p, { ...pill(p.start, p.end), top: 0, bottom: 0 }, "rounded-[9px]", resizable))}
        {/* The ↓ on a sandwiched entry you're pointing at: under the job either side of it. */}
        {onTuck &&
          !edge &&
          main.map((p) => {
            const around = hover?.block?.id === p.block.id ? sandwich.get(p.block.id) : undefined;
            if (!around) return null;
            const outer = nameOf(around)?.name ?? "the one around it";
            return (
              <button
                key={`tuck-${p.block.id}`}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEdgeError(null);
                  void onTuck(p.block).then((problem) => problem && setEdgeError(problem));
                }}
                aria-label={`Put ${nameOf(p.block)?.name ?? "this"} under ${outer}, and join the two ${outer} entries`}
                data-tuck
                className="absolute bottom-1 z-30 grid size-6 -translate-x-1/2 place-items-center rounded-full bg-paper text-ink shadow-md ring-1 ring-ink/20 transition-transform hover:scale-110"
                style={{ left: `${at((p.start + p.end) / 2)}%` }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 5v13M6 12l6 6 6-6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            );
          })}
        {/* While dragging an edge: a line where it'll go. */}
        {edge && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-30 w-0.5 -translate-x-1/2 bg-ink" style={{ left: `${at(edge.at)}%` }} />}
        {/* Faint lines at the time marks. */}
        {!compact &&
          lines.map((t) => (
            <div key={t} aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-10 w-px bg-paper/25 mix-blend-overlay" style={{ left: `${at(t)}%` }} />
          ))}
        {/* What you're pointing at on the map (each a hair apart, so things back to back get their own outline). */}
        {/* Arriving from a stats tile: each one flashed, held, then faded out. */}
        {spotlight?.spans.map((m, i) => {
          const left = at(Math.max(m.start, dayStart));
          const right = at(Math.min(m.end, dayEnd));
          if (right <= 0 || left >= 100) return null;
          return (
            <div
              key={`spot-${i}`}
              aria-hidden="true"
              className="bar-spotlight pointer-events-none absolute inset-y-0 z-10 rounded-[9px] opacity-0 ring-2 ring-inset ring-ink"
              style={{
                left: `min(calc(${left}% + 1px), calc(${(left + right) / 2}% - 6px))`,
                width: `max(calc(${right - left}% - 2px), 12px)`,
                animation: `bar-spotlight ${spotlight.ms}ms ease-out forwards`,
              }}
            />
          );
        })}
        {marks?.map((m, i) => {
          // (Not stopped at the bar's ends: zoomed in, it's cut off where the entry under it is.)
          const left = at(Math.max(m.start, dayStart));
          const right = at(Math.min(m.end, dayEnd));
          if (right <= 0 || left >= 100) return null;
          return (
            <div
              key={i}
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 z-10 rounded-[9px] bg-ink/10 ring-2 ring-inset ring-ink"
              // (A short one, a 3-minute Commute, is still a box you can see: at least 12 px, centered on it.)
              style={{
                left: `min(calc(${left}% + 1px), calc(${(left + right) / 2}% - 6px))`,
                width: `max(calc(${right - left}% - 2px), 12px)`,
              }}
            />
          );
        })}
        {showNow && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-20 w-0.5 -translate-x-1/2 bg-ink" style={{ left: `${at(now)}%` }} />}
        </div>
      </div>

      {edgeError && <p className="mt-1 text-xs text-danger">{edgeError}</p>}

      {/* Running alongside (+ Start): a thin strip per extra row, under the bar. */}
      {sideRows > 0 && (
        <div
          className="relative mt-1 overflow-hidden"
          style={{ height: sideRows * 10 - 2 }}
          onMouseEnter={() => setLeftRow(false)}
          onMouseLeave={() => setLeftRow(true)} // (not at once: its ↑ is just below, past a small gap)
        >
          {side.map((p) => entry(p, { ...pill(p.start, p.end), top: (p.lane - 1) * 10, height: 8 }, "rounded-full"))}
        </div>
      )}
      {sideRows > 0 && (
        <div className="relative h-0">
        {/* The ↑ for an entry under a job you're pointing at: just below it (the row is too thin to
            hold it, and above it is the job, which would take the pointer first). */}
        {onLift &&
          !edge &&
          side.map((p) => {
            const w = hover?.block?.id === p.block.id ? under.get(p.block.id) : undefined;
            if (!w) return null;
            const outer = nameOf(w)?.name ?? "the one above";
            return (
              <button
                key={`lift-${p.block.id}`}
                type="button"
                data-tuck
                onMouseEnter={() => setLeftRow(false)}
                onClick={(e) => {
                  e.stopPropagation();
                  setEdgeError(null);
                  void onLift(p.block).then((problem) => problem && setEdgeError(problem));
                }}
                aria-label={`Bring ${nameOf(p.block)?.name ?? "this"} back up, and split ${outer} around it`}
                className="absolute top-0.5 z-30 grid size-6 -translate-x-1/2 place-items-center rounded-full bg-paper text-ink shadow-md ring-1 ring-ink/20 transition-transform hover:scale-110"
                style={{ left: `${at((p.start + p.end) / 2)}%` }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 19V6M6 12l6-6 6 6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            );
          })}
        </div>
      )}

      {/* Apps you used: a thin line under the bar (hover for which). Under a minute isn't
          shown. Read only: these aren't entries. */}
      {phoneShown.length > 0 && (
        <div className="relative mt-1 h-1.5 overflow-hidden" onMouseLeave={() => setHoverState(null)}>
          {phoneShown.map((u) => (
            <div
              key={u.id}
              aria-label={`${u.kind === "app" ? (u.app ?? "An app") : "On your phone"}, ${clock(new Date(u.start), tz)} to ${u.ended_at ? clock(new Date(u.end), tz) : "now"}`}
              data-anchor
              onMouseEnter={() => setHoverState({ start: u.start, end: u.end, phone: u })}
              className={`absolute inset-y-0 rounded-full bg-ink/50 ${
                hover?.phone?.id === u.id ? "brightness-75" : ""
              }`}
              style={{ left: `${at(u.start)}%`, width: `max(${at(u.end) - at(u.start)}%, 2px)` }}
            />
          ))}
        </div>
      )}

      {!compact && (
        <div className="relative mt-1 h-4 overflow-hidden text-[11px] text-muted">
          {/* Small notches under the bar, and the times. */}
          {lines.map((t) => (
            <span key={`n${t}`} aria-hidden="true" className="absolute top-0 h-1 w-px bg-muted/40" style={{ left: `${at(t)}%` }} />
          ))}
          {labels.map(({ t, text }) => {
            const x = at(t);
            return (
              <span
                key={t}
                className={`num absolute whitespace-nowrap ${x < 2 ? "" : x > 98 ? "-translate-x-full" : "-translate-x-1/2"}`}
                style={{ left: `${x}%` }}
              >
                {text}
              </span>
            );
          })}
        </div>
      )}

      {/* Over the map: the zoom icons go up in the box's header (zoomSlot). */}
      {zoomable && slim && zoomSlot && createPortal(zoomTo, zoomSlot)}
      {zoomable && !slim && (
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted">
          <span className="num">
            {zoomed ? `${clock(new Date(from), tz)} – ${clock(new Date(to), tz)}` : "Pinch or Ctrl+scroll on the bar to zoom"}
          </span>
          <span className="flex items-center gap-1">
            {zoomTo}
          </span>
        </div>
      )}
    </div>
  );
}

const MIN_VIEW = 10 * 60000; // zoom in as far as 10 minutes across
const TINY_PX = 7; // narrower than this on screen: drawn as a chip this wide


// Label spacing (minutes) by how much is on screen: the finest that keeps about 8 labels.
const STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360];

function marksFor(dayKey: string, tz: string, dayStart: number, dayEnd: number, from: number, to: number) {
  const mins = (to - from) / 60000;
  const found = STEPS.findIndex((s) => mins / s <= 8);
  const li = found === -1 ? STEPS.length - 1 : found;
  const labelStep = STEPS[li];
  const lineStep = li > 0 && mins / STEPS[li - 1] <= 16 ? STEPS[li - 1] : labelStep;
  const step = gcd(labelStep, lineStep);
  // Clock minutes into the day (0 = midnight); a little extra room for daylight-saving days.
  const first = Math.floor(Math.max(0, (from - dayStart) / 60000 - 90) / step) * step;
  const lines: number[] = [];
  const labels: { t: number; text: string }[] = [];
  for (let m = first; m <= 1500; m += step) {
    const isLabel = m % labelStep === 0;
    if (!isLabel && m % lineStep !== 0) continue;
    const t = m === 1440 ? dayEnd : +zonedTime(dayKey, m, tz);
    if (t > to || t > dayEnd) break;
    if (t < from) continue;
    if (isLabel) labels.push({ t, text: timeLabel(m) });
    if (m > 0 && m < 1440) lines.push(t);
  }
  return { labels, lines };
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

// 0 → "12a", 810 → "1:30p"
function timeLabel(m: number) {
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${mm ? `:${String(mm).padStart(2, "0")}` : ""}${h < 12 ? "a" : "p"}`;
}
