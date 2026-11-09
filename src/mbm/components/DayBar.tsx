"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import type { Activity, Block, PhoneUse } from "@/mbm/data";
import { clock, span, zonedTime } from "@/mbm/time";
import type { Placed } from "./segments";
import { retimeBlocks } from "@/app/mbm/actions";

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
  onHover,
  marks = null,
  phone = [],
  compact = false,
  slim = false,
}: {
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
  onHover?: (span: { start: number; end: number; block?: Block } | null) => void;
  marks?: { start: number; end: number }[] | null; // outlined (what you're hovering on the map) // what's hovered (the map lights it up)
  phone?: PhoneUse[]; // apps you used (a thin line under the bar)
  compact?: boolean; // the home page's smaller version
  slim?: boolean; // the day page with the map opened up: a shorter bar, no zoom row
}) {
  // What the bubble is about: an entry, or an untracked stretch.
  const [hover, setHoverState] = useState<{ start: number; end: number; block?: Block; phone?: PhoneUse } | null>(null);
  const setHover = (h: { start: number; end: number; block?: Block } | null) => {
    setHoverState(h);
    onHover?.(h && { start: h.start, end: h.end, block: h.block });
  };
  const total = dayEnd - dayStart;
  const zoomable = !compact;
  // The part of the day on screen. Whole day unless zoomed in.
  const [view, setView] = useState<[number, number]>([dayStart, dayEnd]);
  const [from, to] = zoomable ? view : [dayStart, dayEnd];
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
  const zoomAround = (factor: number, frac = 0.5) =>
    setView(([a, b]) => {
      const len = b - a;
      const pivot = a + len * frac;
      return fit(pivot - (pivot - a) * factor, pivot + (b - pivot) * factor);
    });

  // Pinch / Ctrl+scroll zooms around the pointer; sideways scroll pans. A plain scroll still
  // scrolls the page. (Needs a non-passive listener so the browser doesn't zoom the page too.)
  const barRef = useRef<HTMLDivElement>(null);
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
  // linked: the entry right next to it, sharing that edge (both move together).
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
    const others = placed.filter((q) => q.lane === 0 && q.block.id !== p.block.id);
    let linked: Edge["linked"] = null;
    let min: number;
    let max: number;
    if (side === "end") {
      const next = others.filter((q) => q.start >= p.end - MIN).sort((a, b) => a.start - b.start)[0];
      min = p.start + MIN;
      if (next && Math.abs(next.start - p.end) < MIN) {
        linked = { id: next.block.id, side: "start" };
        max = next.end - MIN;
      } else max = Math.min(next ? next.start : Infinity, now, dayEnd);
    } else {
      const prev = others.filter((q) => q.end <= p.start + MIN).sort((a, b) => b.end - a.end)[0];
      max = p.end - MIN;
      if (prev && Math.abs(prev.end - p.start) < MIN) {
        linked = { id: prev.block.id, side: "end" };
        min = prev.start + MIN;
      } else min = Math.max(prev ? prev.end : -Infinity, dayStart);
    }
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
    retimeBlocks(changes).then((res) => {
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
  const main = shownPlaced.filter((p) => p.lane === 0);
  const side = shownPlaced.filter((p) => p.lane > 0);
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
  // One entry: hover for what it was, click to change it.
  // (A plain function, not a component, so the pills aren't re-made on every hover.)
  const entry = (p: Placed, style: CSSProperties, round: string, handles = false) => {
    const a = nameOf(p.block);
    // Grab either end to change its time (not an end that's off this day, or "now" while running).
    const wide = at(p.end) - at(p.start) > 1.2;
    const startOk = handles && wide && +new Date(p.block.started_at) >= dayStart;
    const endOk = handles && wide && p.block.ended_at !== null && +new Date(p.block.ended_at) <= dayEnd;
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

  return (
    <div className="relative">
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
      {/* The speech bubble over the bar: what it was, when, for how long. */}
      {hover && !edge && (
        <div
          role="tooltip"
          className="pointer-events-none absolute bottom-full z-30 mb-2.5 w-max max-w-[16rem] rounded-control bg-accent px-3 py-2 text-accent-ink shadow-lg shadow-ink/25"
          style={{ left: `${hoverMid}%`, transform: `translateX(-${slide}%)` }}
        >
          {hover.phone ? (
            <>
              <p className="text-sm font-semibold">{hover.phone.kind === "app" ? (hover.phone.app ?? "An app") : "On your phone"}</p>
              <p className="num text-xs opacity-80">
                {clock(new Date(hover.start), tz)} – {hover.phone.ended_at ? clock(new Date(hover.end), tz) : "now"} · {span(hover.end - hover.start)}
              </p>
            </>
          ) : hover.block ? (
            <>
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <span className="size-2 rounded-full ring-1 ring-accent-ink/40" style={{ background: nameOf(hover.block)?.color ?? "#a98467" }} />
                {nameOf(hover.block)?.name ?? "Something"}
              </p>
              <p className="num text-xs opacity-80">
                {clock(hover.block.started_at, tz)} – {hover.block.ended_at ? clock(hover.block.ended_at, tz) : "now"} ·{" "}
                {span((hover.block.ended_at ? +new Date(hover.block.ended_at) : now) - +new Date(hover.block.started_at))}
              </p>
              {hover.block.note && <p className="mt-0.5 line-clamp-2 text-xs opacity-80">{hover.block.note}</p>}
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">Untracked</p>
              <p className="num text-xs opacity-80">
                {clock(new Date(hover.start), tz)} – {clock(new Date(hover.end), tz)} · {span(hover.end - hover.start)}
              </p>
              {onSelectGap && <p className="mt-0.5 text-xs opacity-80">Click to fill it in</p>}
            </>
          )}
        </div>
      )}
      {/* The bubble's tail, pointing right at the entry (the bubble itself stays on screen). */}
      {hover && !edge && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-full z-30 mb-[3px] size-0 -translate-x-1/2 border-x-[7px] border-t-[7px] border-x-transparent border-t-accent"
          style={{ left: `${hoverMid}%` }}
        />
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
              onMouseEnter={() => setHover(g)}
              onFocus={() => setHover(g)}
              onBlur={() => setHover(null)}
              onClick={() => onSelectGap(g)}
              className={`${cls} transition-[filter] hover:brightness-95`}
              style={style}
            />
          ) : (
            <div key={g.start} aria-hidden="true" onMouseEnter={() => setHover(g)} className={cls} style={style} />
          );
        })}
        {now < dayEnd && <div className="absolute inset-y-0 right-0 bg-paper" style={{ left: `${Math.max(0, at(now))}%` }} />}
        {main.map((p) => entry(p, { ...pill(p.start, p.end), top: 0, bottom: 0 }, "rounded-[9px]", resizable))}
        {/* While dragging an edge: a line where it'll go. */}
        {edge && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-30 w-0.5 -translate-x-1/2 bg-ink" style={{ left: `${at(edge.at)}%` }} />}
        {/* Faint lines at the time marks. */}
        {!compact &&
          lines.map((t) => (
            <div key={t} aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-10 w-px bg-paper/25 mix-blend-overlay" style={{ left: `${at(t)}%` }} />
          ))}
        {/* What you're pointing at on the map. */}
        {marks?.map((m, i) => {
          const left = Math.max(0, at(Math.max(m.start, from)));
          const right = Math.min(100, at(Math.min(m.end, to)));
          if (right <= 0 || left >= 100) return null;
          return (
            <div
              key={i}
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 z-10 rounded-[9px] bg-ink/10 ring-2 ring-inset ring-ink"
              style={{ left: `${left}%`, width: `max(${right - left}%, 3px)` }}
            />
          );
        })}
        {showNow && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-20 w-0.5 -translate-x-1/2 bg-ink" style={{ left: `${at(now)}%` }} />}
        </div>
      </div>

      {edgeError && <p className="mt-1 text-xs text-danger">{edgeError}</p>}

      {/* Running alongside (+ Start): a thin strip per extra row, under the bar. */}
      {sideRows > 0 && (
        <div className="relative mt-1 overflow-hidden" style={{ height: sideRows * 10 - 2 }} onMouseLeave={() => setHover(null)}>
          {side.map((p) => entry(p, { ...pill(p.start, p.end), top: (p.lane - 1) * 10, height: 8 }, "rounded-full"))}
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

      {zoomable && !slim && (
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted">
          <span className="num">
            {zoomed ? `${clock(new Date(from), tz)} – ${clock(new Date(to), tz)}` : "Pinch or Ctrl+scroll on the bar to zoom"}
          </span>
          <span className="flex items-center gap-1">
            {zoomed && (
              <button type="button" onClick={() => setView([dayStart, dayEnd])} className="rounded-control px-2 py-1 hover:bg-surface hover:text-ink">
                Whole day
              </button>
            )}
            <ZoomButton label="Zoom out" disabled={!zoomed} onClick={() => zoomAround(2)}>
              −
            </ZoomButton>
            <ZoomButton label="Zoom in" disabled={shown <= MIN_VIEW} onClick={() => zoomAround(0.5, showNow && !zoomed ? at(now) / 100 : 0.5)}>
              +
            </ZoomButton>
          </span>
        </div>
      )}
    </div>
  );
}

const MIN_VIEW = 10 * 60000; // zoom in as far as 10 minutes across
const TINY_PX = 7; // narrower than this on screen: drawn as a chip this wide

function ZoomButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-control text-base leading-none ring-1 ring-line transition-colors hover:bg-surface hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

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
