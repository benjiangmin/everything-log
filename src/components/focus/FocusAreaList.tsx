"use client";

import { useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { deleteFocusArea, deleteFocusLog, saveFocusLog, updateFocusArea, updateFocusLog } from "@/app/focus/actions";
import type { FocusArea, FocusLog } from "@/lib/focus";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import DateWheel from "@/components/ui/DateWheel";
import { useToday } from "@/components/journal/useToday";
import { localNow } from "@/lib/month";

const field =
  "w-full rounded-control border border-line bg-paper px-3 py-2.5 text-ink placeholder:text-muted/70 focus:border-ink";

function todayKey() {
  const d = localNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// "2025-07-23" → { short: "Jul 23", long: "Jul 23, 2025" }
function dateParts(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    short: dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    long: dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
  };
}
const daysLogged = (n: number) => `${n} ${n === 1 ? "day" : "days"} logged`;

// Text with web links made clickable, shown short ("learn.unity.com/tutorial/lesson-3…").
function Linkified({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(/https?:\/\/[^\s()]+/g)) {
    const url = m[0];
    const shown = url.replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "");
    parts.push(text.slice(last, m.index));
    parts.push(
      <a
        key={m.index}
        href={url}
        target="_blank"
        rel="noreferrer"
        title={url}
        onClick={(e) => e.stopPropagation()}
        className="break-all underline decoration-accent/40 underline-offset-[3px] transition-colors hover:decoration-accent"
      >
        {shown.length > 42 ? `${shown.slice(0, 40)}…` : shown}
      </a>,
    );
    last = m.index + url.length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

// Left: the focus areas (just their names). Right: a black-bordered box that's empty until you
// pick one, then shows its add box on top and its logs below (newest first).
export default function FocusAreaList({ areas, focusId }: { areas: FocusArea[]; focusId?: string }) {
  const [selected, setSelected] = useState<string | null>(() => areas.find((a) => a.logs.some((l) => l.id === focusId))?.id ?? null);

  // Picked a search result while already on the page: show its focus area.
  const [seenFocus, setSeenFocus] = useState(focusId);
  if (focusId !== seenFocus) {
    setSeenFocus(focusId);
    const holder = areas.find((a) => a.logs.some((l) => l.id === focusId));
    if (holder) setSelected(holder.id);
  }

  const area = areas.find((a) => a.id === selected) ?? null;

  return (
    <div className="mt-5 flex flex-col gap-6 lg:min-h-[32rem] lg:flex-1 lg:basis-0 lg:flex-row">
      {/* ---------- Left: the focus areas ---------- */}
      <section aria-label="Focus areas" className="shrink-0 lg:w-[19rem]">
        {areas.length === 0 ? (
          <p className="rounded-card border border-dashed border-line px-5 py-6 text-muted">No focus areas yet. Add one above.</p>
        ) : (
          <ul className="space-y-2">
            {areas.map((a) => (
              <AreaCard key={a.id} area={a} selected={a.id === selected} onSelect={() => setSelected(a.id)} onDeleted={() => a.id === selected && setSelected(null)} />
            ))}
          </ul>
        )}
      </section>

      {/* ---------- Right: the chosen focus area's logs ---------- */}
      <section
        aria-label={area ? `${area.name} logs` : "Logs"}
        className="relative flex h-[75dvh] min-h-[24rem] min-w-0 flex-col overflow-hidden rounded-card border-[1.5px] border-ink lg:h-auto lg:min-h-0 lg:flex-1"
      >
        {area && <AreaPanel key={area.id} area={area} focusId={focusId} />}
      </section>
    </div>
  );
}

function AreaCard({ area, selected, onSelect, onDeleted }: { area: FocusArea; selected: boolean; onSelect: () => void; onDeleted: () => void }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();

  async function remove() {
    const ok = await confirm({ title: `Delete "${area.name}"?`, body: `It and all ${area.logs.length} of its logs will be removed for good.`, confirmLabel: "Delete" });
    if (!ok) return;
    onDeleted();
    startTransition(() => deleteFocusArea(area.id));
  }

  if (editing) return <AreaEditor area={area} onDone={() => setEditing(false)} />;

  return (
    <li
      className={`group flex items-center gap-1 rounded-card pr-1.5 transition-colors ${pending ? "opacity-40" : ""} ${
        selected ? "bg-accent text-accent-ink shadow-md shadow-ink/15" : "bg-surface text-ink hover:bg-line/70"
      }`}
    >
      <button type="button" onClick={onSelect} aria-pressed={selected} className="min-w-0 flex-1 px-4 py-3 text-left">
        <span className="block truncate font-display text-lg font-semibold leading-snug">{area.name}</span>
        <span className={`num block text-sm ${selected ? "opacity-75" : "text-muted"}`}>{daysLogged(area.logs.length)}</span>
      </button>
      {/* Rename / delete: show on hover (always on the chosen one). */}
      <div className={`flex shrink-0 transition-opacity ${selected ? "opacity-80" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"}`}>
        <IconButton label={`Rename ${area.name}`} onClick={() => setEditing(true)} disabled={pending} light={selected}>
          <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />
        </IconButton>
        <IconButton label={`Delete ${area.name}`} onClick={remove} disabled={pending} danger light={selected}>
          <path d="M6 6l12 12M18 6L6 18" />
        </IconButton>
      </div>
    </li>
  );
}

function AreaEditor({ area, onDone }: { area: FocusArea; onDone: () => void }) {
  const [name, setName] = useState(area.name);
  const [goal, setGoal] = useState(area.goal ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <li className="rounded-card bg-surface p-3 ring-1 ring-line">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await updateFocusArea(area.id, name, goal);
            if (res.ok) onDone();
            else setMessage(res.message);
          });
        }}
        className="flex flex-col gap-2"
      >
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} aria-label="Name" style={{ outline: "none" }} className={`${field} font-semibold`} />
        <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} maxLength={2000} placeholder="The goal (optional)" aria-label="Goal" style={{ outline: "none" }} className={`${field} resize-y text-sm`} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending} className="rounded-control bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:opacity-90 disabled:opacity-60">
            {pending ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onDone} className="rounded-control px-3 py-2 text-sm text-muted hover:bg-paper hover:text-ink">
            Cancel
          </button>
          {message && <p className="text-sm text-danger">{message}</p>}
        </div>
      </form>
    </li>
  );
}

// The right box for one focus area: name (+ goal) and jumps on top, the add box, then the logs.
function AreaPanel({ area, focusId }: { area: FocusArea; focusId?: string }) {
  const [scrolled, setScrolled] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const jump = (to: "top" | "bottom") => {
    const el = scrollerRef.current;
    if (el) el.scrollTo({ top: to === "top" ? 0 : el.scrollHeight, behavior: "smooth" });
  };

  return (
    <>
      <div className="relative z-10 shrink-0 bg-paper px-4 pb-3 pt-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold">{area.name}</h2>
            {area.goal && (
              <p className="mt-0.5 whitespace-pre-line break-words text-sm text-muted">
                <Linkified text={area.goal} />
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <p className="num mr-1 text-sm text-muted">{daysLogged(area.logs.length)}</p>
            {area.logs.length > 0 && (
              <>
                <JumpButton label="Jump to the newest" onClick={() => jump("top")} dir="up" />
                <JumpButton label="Jump to the oldest" onClick={() => jump("bottom")} dir="down" />
              </>
            )}
          </div>
        </div>
        <div className="mt-3">
          <LogComposer area={area} />
        </div>
        {/* Fade under the top part once the logs have scrolled. */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 top-full h-6 bg-gradient-to-b from-paper to-transparent transition-opacity duration-200 ${
            scrolled ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollerRef}
          data-scroller
          onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
          className="absolute inset-0 overflow-y-auto px-3 pb-4 sm:px-4"
        >
          {area.logs.length === 0 ? (
            <p className="mt-1 rounded-card border border-dashed border-line px-5 py-6 text-muted">No logs yet.</p>
          ) : (
            <ul className="space-y-2">
              {area.logs.map((l) => (
                <LogRow key={l.id} log={l} focused={l.id === focusId} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

// The add box: date | the log [+ Notes] | Add. One log per day: picking a day that already has one
// loads it, and saving updates it.
function LogComposer({ area }: { area: FocusArea }) {
  const today = useToday();
  const [date, setDate] = useState(() => todayKey());
  // Once the browser knows its own date, start there (the server's guess may be a day off).
  const [seenToday, setSeenToday] = useState(today);
  if (today !== seenToday) {
    setSeenToday(today);
    if (today) setDate(today);
  }
  const existing = area.logs.find((l) => l.entry_date === date) ?? null;
  return <ComposerFields key={`${date}-${existing?.id ?? "new"}`} areaId={area.id} date={date} existing={existing} onDate={setDate} />;
}

function ComposerFields({ areaId, date, existing, onDate }: { areaId: string; date: string; existing: FocusLog | null; onDate: (d: string) => void }) {
  const [log, setLog] = useState(existing?.log ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [showNotes, setShowNotes] = useState(Boolean(existing?.notes));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await saveFocusLog(areaId, date, log, notes);
          setMessage(res.ok ? null : res.message);
        });
      }}
      className="rounded-card bg-line/60 p-3 ring-1 ring-accent/20"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="sm:w-44 sm:shrink-0">
          <DateWheel key={date} name="focus_date" defaultValue={date} onChange={onDate} />
        </div>
        <div className="relative flex min-w-0 flex-1">
          <textarea
            value={log}
            onChange={(e) => setLog(e.target.value)}
            rows={1}
            maxLength={5000}
            placeholder="The log"
            aria-label="Log"
            style={{ outline: "none" }}
            className={`${field} field-sizing-content min-h-11 resize-none pr-24 leading-relaxed`}
          />
          <button
            type="button"
            onClick={() => setShowNotes((v) => !v)}
            aria-expanded={showNotes}
            className={`absolute right-1.5 top-[7px] rounded-[9px] px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              showNotes ? "bg-accent/15 text-accent" : "bg-surface text-muted hover:text-ink"
            }`}
          >
            {showNotes ? "− Notes" : "+ Notes"}
          </button>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="h-11 shrink-0 rounded-control bg-accent px-5 font-semibold text-accent-ink shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Saving…" : existing ? "Update" : "Add"}
        </button>
      </div>
      {showNotes && (
        <div className="mt-3 border-t border-accent/20 pt-3">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={5000}
            placeholder="Notes (optional)"
            aria-label="Notes (optional)"
            style={{ outline: "none" }}
            className={`${field} resize-y leading-relaxed`}
          />
        </div>
      )}
      {(message || existing) && (
        <p role="status" className={`mt-2 px-1 text-sm ${message ? "text-danger" : "text-muted"}`}>
          {message ?? "This day already has a log. Saving updates it."}
        </p>
      )}
    </form>
  );
}

// One day: date | log, folded (notes hidden). Click to show the notes.
function LogRow({ log, focused }: { log: FocusLog; focused: boolean }) {
  const [open, setOpen] = useState(focused);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const ref = useRef<HTMLLIElement>(null);
  const { short, long } = dateParts(log.entry_date);

  // Arrived from a search result: jump the box (not the page) to it while it flashes.
  useLayoutEffect(() => {
    const el = ref.current;
    const scroller = el?.closest<HTMLElement>("[data-scroller]");
    if (!focused || !el || !scroller) return;
    scroller.scrollTo({ top: el.offsetTop - 12, behavior: "instant" });
  }, [focused]);

  async function remove() {
    const ok = await confirm({ title: "Delete this day's log?", body: `The log for ${long} will be removed for good.`, confirmLabel: "Delete" });
    if (ok) startTransition(() => deleteFocusLog(log.id));
  }

  if (editing) return <LogEditor log={log} onDone={() => setEditing(false)} />;

  return (
    <li ref={ref} className={`group rounded-card bg-surface px-3 py-2.5 transition-opacity sm:px-4 ${pending ? "opacity-40" : ""} ${focused ? "flash" : ""}`}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          disabled={!log.notes}
          className="flex min-w-0 flex-1 items-start gap-3 text-left disabled:cursor-default"
        >
          <span className="num w-14 shrink-0 pt-px text-sm font-semibold text-muted">{short}</span>
          <span className="min-w-0 flex-1 whitespace-pre-line break-words leading-relaxed text-ink">
            <Linkified text={log.log} />
          </span>
          {log.notes && (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className={`mt-1.5 shrink-0 text-muted/70 transition-transform ${open ? "rotate-180" : ""}`}
            >
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
        <div className="-my-1 -mr-1 flex shrink-0">
          <IconButton label={`Edit the log for ${long}`} onClick={() => setEditing(true)} disabled={pending}>
            <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />
          </IconButton>
          <IconButton label={`Delete the log for ${long}`} onClick={remove} disabled={pending} danger>
            <path d="M6 6l12 12M18 6L6 18" />
          </IconButton>
        </div>
      </div>
      {open && log.notes && (
        <p className="ml-[4.25rem] mt-2 whitespace-pre-line break-words border-t border-accent/20 pt-2 text-sm leading-relaxed text-ink/70">
          <Linkified text={log.notes} />
        </p>
      )}
    </li>
  );
}

function LogEditor({ log, onDone }: { log: FocusLog; onDone: () => void }) {
  const [date, setDate] = useState(log.entry_date);
  const [text, setText] = useState(log.log);
  const [notes, setNotes] = useState(log.notes ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <li className="rounded-card bg-surface p-3 ring-1 ring-line">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await updateFocusLog(log.id, date, text, notes);
            if (res.ok) onDone();
            else setMessage(res.message);
          });
        }}
        className="flex flex-col gap-2"
      >
        <div className="w-44">
          <DateWheel name="edit_date" defaultValue={log.entry_date} onChange={setDate} />
        </div>
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={5000} aria-label="Log" style={{ outline: "none" }} className={`${field} resize-y leading-relaxed`} />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={5000}
          placeholder="Notes (optional)"
          aria-label="Notes"
          style={{ outline: "none" }}
          className={`${field} resize-y leading-relaxed`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending} className="rounded-control bg-accent px-5 py-2.5 font-semibold text-accent-ink hover:opacity-90 disabled:opacity-60">
            {pending ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onDone} className="rounded-control px-4 py-2.5 text-muted hover:bg-paper hover:text-ink">
            Cancel
          </button>
          {message && <p className="text-sm text-danger">{message}</p>}
        </div>
      </form>
    </li>
  );
}

function JumpButton({ label, onClick, dir }: { label: string; onClick: () => void; dir: "up" | "down" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-8 place-items-center rounded-control text-muted transition-colors hover:bg-surface hover:text-ink"
    >
      {/* Arrow to a line: ⤒ / ⤓ */}
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {dir === "up" ? (
          <path d="M5 4h14M12 20V9m0 0l-5 5m5-5l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M5 20h14M12 4v11m0 0l-5-5m5 5l5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    </button>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  light,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  light?: boolean; // on the dark (chosen) card
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid size-8 place-items-center rounded-control transition ${
        light ? "text-accent-ink hover:bg-accent-ink/15" : "text-muted opacity-50 hover:bg-paper group-hover:text-black group-hover:opacity-100"
      } ${danger ? "hover:text-danger!" : ""}`}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}
