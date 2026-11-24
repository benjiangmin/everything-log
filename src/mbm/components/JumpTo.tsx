"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Range } from "@/mbm/stats";

// Stats' "Jump to": a little picker that opens under the title's arrows. Day and week: a month
// of days (for a week, the whole row lights up); month: the twelve months of a year; year: the
// years. Picking one goes straight there. Nothing past today.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const key = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export default function JumpTo({ range, current, today, color }: { range: Range; current: string; today: string; color: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cy, cm] = current.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const [year, setYear] = useState(cy);
  const [month, setMonth] = useState(cm - 1);
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const go = (day: string) => {
    setOpen(false);
    router.push(`/stats?range=${range}&day=${day}`);
  };
  const future = (y: number, m: number, d = 1) => key(y, m, d) > today;

  // A month of days, weeks starting Sunday.
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const rows = Array.from({ length: cells.length / 7 }, (_, r) => cells.slice(r * 7, r * 7 + 7));

  const stepMonth = (n: number) => {
    const t = year * 12 + month + n;
    setYear(Math.floor(t / 12));
    setMonth(((t % 12) + 12) % 12);
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => {
          setYear(cy);
          setMonth(cm - 1);
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-control px-3 py-2 text-sm font-semibold transition-colors hover:bg-surface"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="15" rx="3" stroke="currentColor" strokeWidth="2" />
          <path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Jump to
      </button>
      {open && (
        <div role="dialog" aria-label="Jump to" className="absolute right-0 top-full z-40 mt-2 w-72 rounded-card border border-line bg-paper p-4 shadow-xl shadow-ink/15">
          {range === "year" ? (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: Math.max(3, ty - 2023) }, (_, i) => ty - i).map((y) => (
                <Cell key={y} on={y === cy} color={color} onClick={() => go(key(y, 0, 1))}>
                  {y}
                </Cell>
              ))}
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <Step dir={-1} onClick={() => (range === "month" ? setYear(year - 1) : stepMonth(-1))} />
                <p className="font-semibold">{range === "month" ? year : `${MONTHS[month]} ${year}`}</p>
                <Step dir={1} disabled={range === "month" ? year >= ty : year * 12 + month >= ty * 12 + tm - 1} onClick={() => (range === "month" ? setYear(year + 1) : stepMonth(1))} />
              </div>
              {range === "month" ? (
                <div className="grid grid-cols-3 gap-2">
                  {MONTHS.map((m, i) => (
                    <Cell key={m} on={year === cy && i === cm - 1} color={color} disabled={future(year, i)} onClick={() => go(key(year, i, 1))}>
                      {m}
                    </Cell>
                  ))}
                </div>
              ) : (
                <div onMouseLeave={() => setHoverRow(null)}>
                  <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-semibold text-muted">
                    {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                      <span key={i}>{d}</span>
                    ))}
                  </div>
                  {rows.map((row, r) => (
                    <div
                      key={r}
                      onMouseEnter={() => range === "week" && setHoverRow(r)}
                      className="grid grid-cols-7 rounded-control"
                      style={range === "week" && hoverRow === r ? { background: `${color}22` } : undefined}
                    >
                      {row.map((d, c) =>
                        d === null ? (
                          <span key={c} />
                        ) : (
                          <button
                            key={c}
                            type="button"
                            disabled={future(year, month, d)}
                            onClick={() => go(key(year, month, d))}
                            className={`num m-0.5 grid aspect-square place-items-center rounded-full text-sm transition-colors disabled:opacity-30 ${
                              key(year, month, d) === current ? "font-semibold text-[#fbf6ef]" : "hover:bg-surface"
                            } ${year === ty && month === tm - 1 && d === td && key(year, month, d) !== current ? "font-semibold underline underline-offset-4" : ""}`}
                            style={key(year, month, d) === current ? { background: color } : undefined}
                          >
                            {d}
                          </button>
                        ),
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Cell({ on, color, disabled, onClick, children }: { on: boolean; color: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-control py-2.5 text-sm font-semibold transition-colors disabled:opacity-30 ${on ? "text-[#fbf6ef]" : "hover:bg-surface"}`}
      style={on ? { background: color } : undefined}
    >
      {children}
    </button>
  );
}

function Step({ dir, disabled, onClick }: { dir: 1 | -1; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} aria-label={dir < 0 ? "Earlier" : "Later"} className="grid size-8 place-items-center rounded-full hover:bg-surface disabled:opacity-30">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d={dir < 0 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
