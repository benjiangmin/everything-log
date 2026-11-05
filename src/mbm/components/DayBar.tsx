"use client";

import type { Activity } from "@/mbm/data";
import { clock, span, zonedTime } from "@/mbm/time";
import type { Segment } from "./segments";

// The whole day (midnight to midnight) as one bar: each block in its activity's color, untracked
// time striped, the rest of today plain, and a line at "now". Click a block to open it.
export default function DayBar({
  segments,
  dayKey,
  dayStart,
  dayEnd,
  now,
  tz,
  byId,
  selected,
  onSelect,
  compact = false,
}: {
  segments: Segment[];
  dayKey: string;
  dayStart: number;
  dayEnd: number;
  now: number;
  tz: string;
  byId: Map<string, Activity>;
  selected?: string | null;
  onSelect?: (s: Segment) => void;
  compact?: boolean; // the home page's smaller version
}) {
  const total = dayEnd - dayStart;
  const pct = (t: number) => `${((t - dayStart) / total) * 100}%`;
  const showNow = now > dayStart && now < dayEnd;
  // Hour marks every 3 hours, placed by the real clock time (so daylight-saving days line up).
  const marks = [0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => ({ h, at: h === 24 ? dayEnd : +zonedTime(dayKey, h * 60, tz) }));

  return (
    <div>
      <div
        className={`relative overflow-hidden rounded-control bg-[repeating-linear-gradient(135deg,var(--line)_0_6px,transparent_6px_12px)] ring-1 ring-line ${
          compact ? "h-7" : "h-12"
        }`}
      >
        {segments.map((s) => {
          const style = { left: pct(s.start), width: `${((s.end - s.start) / total) * 100}%` };
          if (s.kind === "future") return <div key={`f${s.start}`} className="absolute inset-y-0 bg-paper" style={style} />;
          if (s.kind === "gap") {
            return onSelect ? (
              <button
                key={`g${s.start}`}
                type="button"
                title={`Untracked · ${clock(new Date(s.start), tz)} – ${clock(new Date(s.end), tz)} · ${span(s.end - s.start)}`}
                onClick={() => onSelect(s)}
                className="absolute inset-y-0 transition-colors hover:bg-accent/10"
                style={style}
              />
            ) : null;
          }
          const a = s.block.activity_id ? byId.get(s.block.activity_id) : undefined;
          const label = `${a?.name ?? "Something"} · ${clock(new Date(s.start), tz)} – ${s.block.ended_at ? clock(new Date(s.end), tz) : "now"} · ${span(s.end - s.start)}`;
          const cls = `absolute inset-y-0 border-r border-paper/70 transition-[filter] ${selected === s.block.id ? "z-10 ring-2 ring-inset ring-ink" : ""} ${
            s.block.confirmed ? "" : "opacity-60"
          }`;
          return onSelect ? (
            <button key={s.block.id} type="button" title={label} aria-label={label} onClick={() => onSelect(s)} className={`${cls} hover:brightness-110`} style={{ ...style, background: a?.color ?? "#a98467" }} />
          ) : (
            <div key={s.block.id} title={label} className={cls} style={{ ...style, background: a?.color ?? "#a98467" }} />
          );
        })}
        {showNow && <div aria-hidden="true" className="absolute inset-y-0 z-20 w-0.5 -translate-x-1/2 bg-ink" style={{ left: pct(now) }} />}
      </div>
      {!compact && (
        <div className="relative mt-1 h-4 text-[11px] text-muted">
          {marks.map(({ h, at }) => (
            <span
              key={h}
              className={`num absolute ${h === 0 ? "" : h === 24 ? "-translate-x-full" : "-translate-x-1/2"}`}
              style={{ left: pct(at) }}
            >
              {h === 0 || h === 24 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
