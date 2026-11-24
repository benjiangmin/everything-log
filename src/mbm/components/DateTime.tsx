"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Floating from "./Floating";

// Date and time pickers in the app's own look (instead of the browser's calendar and clock).
// Values are the same as the browser's: "2026-11-24" and "21:30".

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");
const key = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parse = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
};

function usePopover(initial = false) {
  const [open, setOpen] = useState(initial);
  const box = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && !pop.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return { open, setOpen, box, pop };
}

// Typed dates: 05/12/2004, 5/12/04, 2004-05-12, May 12 2004. Digits get their slashes as you type.
function typed(text: string): string | null {
  const t = text.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{2}|\d{4})$/.exec(t);
  if (m) {
    let y = +m[3];
    if (m[3].length === 2) y += y > (new Date().getFullYear() % 100) ? 1900 : 2000;
    return valid(y, +m[1], +m[2]);
  }
  m = /^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i.exec(t);
  if (m) {
    const i = LONG.findIndex((x) => x.toLowerCase().startsWith(m![1].toLowerCase().slice(0, 3)));
    if (i >= 0) return valid(+m[3], i + 1, +m[2]);
  }
  return null;
}
function valid(y: number, m: number, d: number) {
  if (y < 1900 || m < 1 || m > 12 || d < 1 || d > new Date(y, m, 0).getDate()) return null;
  return key(y, m - 1, d);
}
function slashes(text: string) {
  if (/[a-z]/i.test(text) || text.includes("-")) return text;
  const d = text.replace(/\D/g, "").slice(0, 8);
  return d.length <= 2 ? d : d.length <= 4 ? `${d.slice(0, 2)}/${d.slice(2)}` : `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

const fieldLook = (open: boolean) =>
  `flex w-full items-center justify-between gap-2 rounded-control border bg-paper px-3 py-2.5 text-left text-sm font-normal transition-colors disabled:opacity-50 ${
    open ? "border-ink" : "border-line hover:border-ink/40"
  }`;

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      {children}
    </svg>
  );
}

// A day. Tap the month to pick a month, again for the year (birthdays are years back).
export function DatePicker({
  value,
  defaultValue,
  onChange,
  name,
  max,
  min,
  label,
  placeholder = "Pick a day",
  className = "w-full",
  big = false,
  disabled = false,
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  name?: string;
  max?: string;
  min?: string;
  label?: string;
  placeholder?: string;
  className?: string;
  big?: boolean; // the setup's large underlined look
  disabled?: boolean;
}) {
  const [own, setOwn] = useState(defaultValue ?? "");
  const current = value ?? own;
  const { open, setOpen, box, pop } = usePopover();
  const field = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<string | null>(null); // while typing
  const [bad, setBad] = useState(false);
  const at = parse(current) ?? parse(max ?? "") ?? { y: 2000, m: 0, d: 1 };
  const [year, setYear] = useState(at.y);
  const [month, setMonth] = useState(at.m);
  const [view, setView] = useState<"days" | "months" | "years">("days");
  const hi = parse(max ?? "");
  const lo = parse(min ?? "");
  const out = (y: number, m: number, d: number) => (max ? key(y, m, d) > max : false) || (min ? key(y, m, d) < min : false);
  const sel = parse(current);
  const shown = sel ? `${LONG[sel.m]} ${sel.d}, ${sel.y}` : "";

  const pick = (v: string) => {
    if (value === undefined) setOwn(v);
    onChange?.(v);
    setDraft(null);
    setBad(false);
    setOpen(false);
  };
  const show = () => {
    setYear(at.y);
    setMonth(at.m);
    setView("days");
    setOpen(true);
  };
  const toggle = () => (open ? setOpen(false) : show());
  // A typed date counts once it's whole (and in range); the calendar follows along.
  const type = (text: string) => {
    const t = slashes(text);
    setDraft(t);
    setBad(false);
    const v = typed(t);
    if (v && !out(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8))) {
      setYear(+v.slice(0, 4));
      setMonth(+v.slice(5, 7) - 1);
      setView("days");
    }
  };
  const settle = () => {
    if (draft === null) return;
    if (draft.trim() === "") return pick("");
    const v = typed(draft);
    if (v && !out(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8))) pick(v);
    else setBad(true);
  };
  const step = (dir: 1 | -1) => {
    if (view === "years") return setYear(year + dir * 12);
    if (view === "months") return setYear(year + dir);
    const n = year * 12 + month + dir;
    setYear(Math.floor(n / 12));
    setMonth(n % 12);
  };
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)] as (number | null)[];
  const yearStart = Math.floor(year / 12) * 12;
  const canNext = view === "years" ? !hi || yearStart + 12 <= hi.y : view === "months" ? !hi || year < hi.y : !hi || year * 12 + month < hi.y * 12 + hi.m;
  const canPrev = view === "years" ? !lo || yearStart > lo.y : view === "months" ? !lo || year > lo.y : !lo || year * 12 + month > lo.y * 12 + lo.m;

  return (
    <div ref={box} className={`relative ${className}`}>
      {name && <input type="hidden" name={name} value={current} />}
      <div
        ref={field}
        className={
          big
            ? `flex w-full items-center gap-2 border-b transition-colors ${open ? "border-ink" : "border-line"}`
            : `flex w-full items-center gap-1 rounded-control border bg-paper pr-1.5 transition-colors ${open ? "border-ink" : "border-line hover:border-ink/40"} ${disabled ? "opacity-50" : ""}`
        }
      >
        <input
          type="text"
          inputMode="text"
          disabled={disabled}
          aria-label={label}
          value={draft ?? shown}
          placeholder={big ? placeholder : `${placeholder} (MM/DD/YYYY)`}
          onFocus={() => {
            setDraft(sel ? `${pad(sel.m + 1)}/${pad(sel.d)}/${sel.y}` : "");
            if (!open) show();
          }}
          onChange={(e) => type(e.target.value)}
          onBlur={settle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              settle();
            }
            if (e.key === "Escape") setOpen(false);
          }}
          className={
            big
              ? "min-w-0 flex-1 bg-transparent py-3 font-display text-3xl font-semibold text-ink placeholder:text-muted/50"
              : "num min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-ink placeholder:text-muted"
          }
          style={{ outline: "none" }}
        />
        <button type="button" disabled={disabled} onClick={toggle} aria-label="Open the calendar" aria-expanded={open} className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-surface">
          <Icon>
            <rect x="3.5" y="5" width="17" height="15" rx="3" />
            <path d="M3.5 10h17M8 3v4M16 3v4" />
          </Icon>
        </button>
      </div>
      {bad && <p className="mt-1.5 text-sm text-danger">That date doesn&apos;t look right. Try MM/DD/YYYY.</p>}
      {open && (
        <Floating anchor={field} popRef={pop} match={false}>
        <div role="dialog" aria-label={label ?? "Pick a day"} onMouseDown={(e) => e.preventDefault()} className="w-72 rounded-card bg-paper p-4 font-sans text-base font-normal shadow-xl shadow-ink/15 ring-1 ring-line">
          <div className="mb-3 flex items-center justify-between">
            <Step dir={-1} disabled={!canPrev} onClick={() => step(-1)} />
            <button
              type="button"
              onClick={() => setView(view === "days" ? "months" : view === "months" ? "years" : "days")}
              className="rounded-control px-2 py-1 text-sm font-semibold hover:bg-surface"
              title={view === "years" ? "Back to days" : "Pick a month or year"}
            >
              {view === "days" ? `${LONG[month]} ${year}` : view === "months" ? year : `${yearStart} – ${yearStart + 11}`}
            </button>
            <Step dir={1} disabled={!canNext} onClick={() => step(1)} />
          </div>
          {view === "years" && (
            <div className="grid grid-cols-3 gap-1.5">
              {Array.from({ length: 12 }, (_, i) => yearStart + i).map((y) => (
                <Cell key={y} on={sel?.y === y} disabled={(hi && y > hi.y) || (lo && y < lo.y) || false} onClick={() => { setYear(y); setView("months"); }}>
                  {y}
                </Cell>
              ))}
            </div>
          )}
          {view === "months" && (
            <div className="grid grid-cols-3 gap-1.5">
              {MONTHS.map((m, i) => (
                <Cell key={m} on={sel?.y === year && sel.m === i} disabled={(hi && year * 12 + i > hi.y * 12 + hi.m) || (lo && year * 12 + i < lo.y * 12 + lo.m) || false} onClick={() => { setMonth(i); setView("days"); }}>
                  {m}
                </Cell>
              ))}
            </div>
          )}
          {view === "days" && (
            <>
              <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-semibold text-muted">
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                  <span key={i}>{d}</span>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {cells.map((d, i) =>
                  d === null ? (
                    <span key={i} />
                  ) : (
                    <button
                      key={i}
                      type="button"
                      disabled={out(year, month, d)}
                      onClick={() => pick(key(year, month, d))}
                      className={`num m-0.5 grid aspect-square place-items-center rounded-full text-sm transition-colors disabled:opacity-30 ${
                        current === key(year, month, d) ? "bg-accent font-semibold text-accent-ink" : "hover:bg-surface"
                      }`}
                    >
                      {d}
                    </button>
                  ),
                )}
              </div>
            </>
          )}
          {current && !name && onChange && (
            <button type="button" onClick={() => pick("")} className="mt-2 text-xs font-semibold text-muted hover:text-ink">
              Clear
            </button>
          )}
        </div>
        </Floating>
      )}
    </div>
  );
}

// A time: hour, minute and AM/PM, each a short list to tap.
export function TimePicker({
  value,
  onChange,
  label,
  className = "w-36",
  defaultOpen = false,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  className?: string;
  defaultOpen?: boolean;
  disabled?: boolean;
}) {
  const { open, setOpen, box, pop } = usePopover(defaultOpen);
  const btn = useRef<HTMLButtonElement>(null);
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  const h24 = m ? +m[1] : 9;
  const min = m ? +m[2] : 0;
  const pm = h24 >= 12;
  const h12 = h24 % 12 || 12;
  const set = (h: number, mm: number, isPm: boolean) => onChange(`${pad((h % 12) + (isPm ? 12 : 0))}:${pad(mm)}`);
  const shown = m ? `${h12}:${pad(min)} ${pm ? "PM" : "AM"}` : "Pick a time";

  return (
    <div ref={box} className={`relative ${className}`}>
      <button ref={btn} type="button" disabled={disabled} aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)} className={`${fieldLook(open)} num ${m ? "text-ink" : "text-muted"}`}>
        <span>{shown}</span>
        <Icon>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </Icon>
      </button>
      {open && (
        <Floating anchor={btn} popRef={pop} match={false}>
        <div role="dialog" aria-label={label ?? "Pick a time"} className="flex gap-1 rounded-card bg-paper p-1.5 shadow-xl shadow-ink/15 ring-1 ring-line">
          <Column items={Array.from({ length: 12 }, (_, i) => i + 1)} on={h12} show={(h) => String(h)} pick={(h) => set(h, min, pm)} />
          <Column items={Array.from({ length: 60 }, (_, i) => i)} on={min} show={pad} pick={(mm) => set(h12, mm, pm)} />
          <Column items={[0, 1]} on={pm ? 1 : 0} show={(x) => (x ? "PM" : "AM")} pick={(x) => set(h12, min, x === 1)} />
        </div>
        </Floating>
      )}
    </div>
  );
}

function Column({ items, on, show, pick }: { items: number[]; on: number; show: (n: number) => string; pick: (n: number) => void }) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>("[data-on]");
    if (el && list.current) list.current.scrollTop = el.offsetTop - list.current.clientHeight / 2 + el.clientHeight / 2;
  }, []);
  return (
    <div ref={list} className="relative max-h-56 w-14 overflow-y-auto">
      {items.map((n) => (
        <button
          key={n}
          type="button"
          data-on={n === on ? "" : undefined}
          onClick={() => pick(n)}
          className={`num block w-full rounded-control py-1.5 text-center text-sm transition-colors ${n === on ? "bg-accent font-semibold text-accent-ink" : "hover:bg-surface"}`}
        >
          {show(n)}
        </button>
      ))}
    </div>
  );
}

function Cell({ on, disabled, onClick, children }: { on: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`rounded-control py-2.5 text-sm font-semibold transition-colors disabled:opacity-30 ${on ? "bg-accent text-accent-ink" : "hover:bg-surface"}`}>
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
