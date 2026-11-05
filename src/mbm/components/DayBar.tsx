"use client";

import { useState } from "react";
import type { Activity, Block } from "@/mbm/data";
import { clock, span, zonedTime } from "@/mbm/time";
import type { Placed } from "./segments";

// The whole day (midnight to midnight) as one bar: each entry in its activity's color, untracked
// time striped, the rest of today plain, and a line at "now". Overlapping entries stack in rows.
// Hover an entry for what it was; click it to change it.
export default function DayBar({
  placed,
  lanes,
  gaps,
  dayKey,
  dayStart,
  dayEnd,
  now,
  tz,
  byId,
  onSelect,
  onSelectGap,
  compact = false,
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
  compact?: boolean; // the home page's smaller version
}) {
  // What the bubble is about: an entry, or an untracked stretch.
  const [hover, setHover] = useState<{ start: number; end: number; block?: Block } | null>(null);
  const total = dayEnd - dayStart;
  const at = (t: number) => ((t - dayStart) / total) * 100;
  const showNow = now > dayStart && now < dayEnd;
  // Labels every 3 hours, tick marks every 2, placed by the real clock time (daylight-saving days line up).
  const hourAt = (h: number) => (h === 24 ? dayEnd : +zonedTime(dayKey, h * 60, tz));
  const marks = [0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => ({ h, at: hourAt(h) }));
  const ticks = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22].map(hourAt);
  const height = compact ? Math.max(48, lanes * 24) : Math.max(56, lanes * 26);

  const nameOf = (b: Block) => (b.activity_id ? byId.get(b.activity_id) : undefined);
  const hoverMid = hover ? at((hover.start + hover.end) / 2) : 0;
  // The bubble sits over the tail, sliding sideways near the ends so it stays on screen
  // (the tail is always inside it).
  const slide = Math.min(90, Math.max(10, hoverMid));

  return (
    <div className="relative">
      {/* The speech bubble over the bar: what it was, when, for how long. */}
      {hover && (
        <div
          role="tooltip"
          className="pointer-events-none absolute bottom-full z-30 mb-2.5 w-max max-w-[16rem] rounded-control bg-accent px-3 py-2 text-accent-ink shadow-lg shadow-ink/25"
          style={{ left: `${hoverMid}%`, transform: `translateX(-${slide}%)` }}
        >
          {hover.block ? (
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
      {hover && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-full z-30 mb-[3px] size-0 -translate-x-1/2 border-x-[7px] border-t-[7px] border-x-transparent border-t-accent"
          style={{ left: `${hoverMid}%` }}
        />
      )}

      <div
        className="relative overflow-hidden rounded-control bg-surface/60 ring-1 ring-line"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
      >
        {/* Untracked: striped, full height. The rest of today (not happened yet): plain. */}
        {gaps.map((g) => {
          const cls = "absolute inset-y-0 bg-[repeating-linear-gradient(135deg,var(--line)_0_6px,transparent_6px_12px)] bg-paper";
          const style = { left: `${at(g.start)}%`, width: `${at(g.end) - at(g.start)}%` };
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
        {placed.map((p) => {
          const a = nameOf(p.block);
          const style = {
            left: `${at(p.start)}%`,
            width: `${at(p.end) - at(p.start)}%`,
            top: `${(p.lane / lanes) * 100}%`,
            height: `${100 / lanes}%`,
            background: a?.color ?? "#a98467",
          };
          const cls = `absolute border-r border-paper/70 transition-[filter] ${lanes > 1 ? "border-b" : ""} ${p.block.confirmed ? "" : "opacity-60"} ${
            hover?.block?.id === p.block.id ? "brightness-110" : ""
          }`;
          const label = `${a?.name ?? "Something"}, ${clock(new Date(p.start), tz)} to ${p.block.ended_at ? clock(new Date(p.end), tz) : "now"}`;
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
              style={style}
            />
          ) : (
            <div key={p.block.id} aria-label={label} onMouseEnter={() => setHover(p)} className={cls} style={style} />
          );
        })}
        {/* A faint line every 2 hours. */}
        {!compact &&
          ticks.map((t) => (
            <div key={t} aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-10 w-px bg-ink/10" style={{ left: `${at(t)}%` }} />
          ))}
        {showNow && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-20 w-0.5 -translate-x-1/2 bg-ink" style={{ left: `${at(now)}%` }} />}
      </div>

      {!compact && (
        <div className="relative mt-1 h-4 text-[11px] text-muted">
          {/* Small notches under the bar every 2 hours. */}
          {ticks.map((t) => (
            <span key={`n${t}`} aria-hidden="true" className="absolute -top-1 h-1 w-px bg-muted/40" style={{ left: `${at(t)}%` }} />
          ))}
          {marks.map(({ h, at: t }) => (
            <span key={h} className={`num absolute ${h === 0 ? "" : h === 24 ? "-translate-x-full" : "-translate-x-1/2"}`} style={{ left: `${at(t)}%` }}>
              {h === 0 || h === 24 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
