"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { fmt, fmtLength, parseLength, parseTime } from "@/mbm/timeText";

// From → to, and how long, as three small text boxes (like Toggl), instead of the browser's clock
// picker. Times are minutes from midnight on the day (0–1440).
//   - Type it however: "930", "9:30", "9:30p", "21:30", "3" (the 3 nearest what was there), "now".
//   - Arrow keys nudge it 5 minutes (Shift: 15, Alt: 1).
//   - While a box is open, a few handy times to pick: now, the entries next to it, round times.
//   - Changing how long moves the end.
export type Pick = { at: number; label: string }; // a handy time, e.g. "End of CS577"

export default function TimeRange({
  start,
  end,
  onChange,
  picks,
  now,
}: {
  start: number;
  end: number | null; // null: still running (no end, no length)
  onChange: (start: number, end: number | null) => void;
  picks: Pick[];
  now: number | null; // minutes now, if it's today
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
      <TimeBox label="Start" value={start} max={end ?? now ?? 1440} picks={picks} now={now} onSet={(v) => onChange(v, end)} />
      {end !== null ? (
        <>
          <span aria-hidden="true" className="text-muted">
            →
          </span>
          <TimeBox label="End" value={end} min={start} picks={picks} now={now} onSet={(v) => onChange(start, v)} />
          <LengthBox length={end - start} onSet={(len) => onChange(start, Math.min(1440, start + len))} />
        </>
      ) : (
        <span className="text-sm text-muted">→ still going</span>
      )}
    </div>
  );
}

const box =
  "num rounded-control border border-line bg-paper px-3 py-2 text-center text-ink transition-colors hover:border-ink/40 focus:border-ink";

function TimeBox({
  label,
  value,
  min = 0,
  max = 1440,
  picks,
  now,
  onSet,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  picks: Pick[];
  now: number | null;
  onSet: (v: number) => void;
}) {
  const [text, setText] = useState<string | null>(null); // null: not typing (show the value)
  const [bad, setBad] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  function commit(t: string) {
    const v = parseTime(t, value, now);
    if (v === null) {
      setBad(true);
      setTimeout(() => setBad(false), 900);
    } else onSet(clamp(v));
    setText(null);
  }

  function key(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault(); // (not the form)
      if (text !== null) commit(text);
      (e.target as HTMLInputElement).blur();
    } else if (e.key === "Escape") {
      setText(null);
      (e.target as HTMLInputElement).blur();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const step = e.shiftKey ? 15 : e.altKey ? 1 : 5;
      const base = text !== null ? (parseTime(text, value, now) ?? value) : value;
      // Up/down to the next step (9:32 → 9:35, not 9:37).
      const next = e.key === "ArrowUp" ? Math.floor(base / step) * step + step : Math.ceil(base / step) * step - step;
      onSet(clamp(next));
      setText(null);
    }
  }

  // Handy times near this one: now, the entries around it, and round times close by.
  const near = [
    ...(now !== null ? [{ at: now, label: "Now" }] : []),
    ...picks,
    ...[-30, -15, 15, 30].map((d) => ({ at: Math.round((value + d) / 15) * 15, label: "" })),
  ]
    .filter((p) => p.at >= min && p.at <= max && p.at !== value)
    .filter((p, i, all) => all.findIndex((q) => q.at === p.at) === i)
    .sort((a, b) => Math.abs(a.at - value) - Math.abs(b.at - value))
    .slice(0, 6)
    .sort((a, b) => a.at - b.at);

  return (
    <div ref={wrap} className="group relative">
      <input
        aria-label={label}
        value={text ?? fmt(value)}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => text !== null && commit(text)}
        onKeyDown={key}
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        className={`${box} w-[6.75rem] ${bad ? "border-danger text-danger" : ""}`}
        style={{ outline: "none" }}
      />
      {/* Handy times, while it's open. */}
      {near.length > 0 && (
        <ul className="invisible absolute left-0 top-full z-30 mt-1.5 w-max min-w-full overflow-hidden rounded-card bg-paper p-1 opacity-0 shadow-xl shadow-ink/15 ring-1 ring-line transition-opacity group-focus-within:visible group-focus-within:opacity-100">
          {near.map((p) => (
            <li key={p.at}>
              <button
                type="button"
                // (mousedown, so the box doesn't lose focus and close first)
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSet(clamp(p.at));
                  setText(null);
                }}
                className="flex w-full items-baseline justify-between gap-4 rounded-control px-2.5 py-1.5 text-left text-sm hover:bg-surface"
              >
                <span className="num font-semibold text-ink">{fmt(p.at)}</span>
                {p.label && <span className="text-xs text-muted">{p.label}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LengthBox({ length, onSet }: { length: number; onSet: (minutes: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  function commit(t: string) {
    const v = parseLength(t);
    if (v === null || v < 1) {
      setBad(true);
      setTimeout(() => setBad(false), 900);
    } else onSet(v);
    setText(null);
  }
  return (
    <input
      aria-label="How long"
      title="How long (changes the end)"
      value={text ?? fmtLength(length)}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => text !== null && commit(text)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (text !== null) commit(text);
          (e.target as HTMLInputElement).blur();
        }
      }}
      autoComplete="off"
      spellCheck={false}
      className={`num ml-1 w-[5.5rem] rounded-control border border-transparent bg-transparent px-2 py-2 text-center text-sm text-muted transition-colors hover:border-line focus:border-ink focus:text-ink ${
        bad ? "border-danger text-danger" : ""
      }`}
      style={{ outline: "none" }}
    />
  );
}
