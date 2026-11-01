"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
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
function dateParts(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    day: String(d),
    month: dt.toLocaleDateString("en-US", { month: "short" }),
    weekday: dt.toLocaleDateString("en-US", { weekday: "short" }),
    long: dt.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" }),
  };
}

// Text with web links made clickable, shown short ("learn.unity.com/tutorial/lesson-3…").
function Linkified({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(/https?:\/\/[^\s)]+/g)) {
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

// Every focus area, folded by default. The one holding a search result opens by itself.
export default function FocusAreaList({ areas, focusId }: { areas: FocusArea[]; focusId?: string }) {
  if (areas.length === 0) {
    return (
      <p className="mt-5 rounded-card border border-dashed border-line px-5 py-8 text-center text-muted">
        No focus areas yet. Add one above: what do you want to work on this stretch?
      </p>
    );
  }
  return (
    <ul className="mt-5 space-y-2.5">
      {areas.map((a) => (
        <Area key={a.id} area={a} focusId={focusId} />
      ))}
    </ul>
  );
}

function Area({ area, focusId }: { area: FocusArea; focusId?: string }) {
  const holdsFocus = area.logs.some((l) => l.id === focusId);
  const [open, setOpen] = useState(holdsFocus);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();

  // Picked a search result in here while already on the page: open up.
  const [seenFocus, setSeenFocus] = useState(focusId);
  if (focusId !== seenFocus) {
    setSeenFocus(focusId);
    if (holdsFocus) setOpen(true);
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete "${area.name}"?`,
      body: `It and all ${area.logs.length} of its logs will be removed for good.`,
      confirmLabel: "Delete",
    });
    if (ok) startTransition(() => deleteFocusArea(area.id));
  }

  return (
    <li className={`overflow-hidden rounded-card border-[1.5px] transition-opacity ${open ? "border-ink" : "border-transparent"} ${pending ? "opacity-40" : ""}`}>
      {editing ? (
        <AreaEditor area={area} onDone={() => setEditing(false)} />
      ) : (
        // The bar: click it to open / fold.
        <div className={`group flex items-start gap-3 px-4 py-3.5 sm:px-5 ${open ? "bg-paper" : "bg-surface"}`}>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-w-0 flex-1 items-start gap-3 text-left">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className={`mt-1.5 shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`}
            >
              <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-lg font-semibold leading-snug text-ink">{area.name}</span>
              {area.goal && (
                // Folded: just the first line of the goal. Open: all of it.
                <span className={`mt-0.5 break-words text-sm text-muted ${open ? "block whitespace-pre-line" : "line-clamp-1"}`}>
                  <Linkified text={area.goal} />
                </span>
              )}
            </span>
            {/* Days logged. */}
            <span className="num mt-1 shrink-0 text-sm text-muted">
              {area.logs.length} {area.logs.length === 1 ? "day" : "days"}
            </span>
          </button>
          <div className="-my-1 -mr-2 flex shrink-0">
            <IconButton label={`Rename or change the goal of ${area.name}`} onClick={() => setEditing(true)} disabled={pending}>
              <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />
            </IconButton>
            <IconButton label={`Delete ${area.name}`} onClick={remove} disabled={pending} danger>
              <path d="M6 6l12 12M18 6L6 18" />
            </IconButton>
          </div>
        </div>
      )}

      {open && (
        <div className="border-t border-accent/20 bg-paper px-3 pb-4 pt-3 sm:px-4">
          <LogComposer area={area} />
          {area.logs.length === 0 ? (
            <p className="mt-3 px-1 text-sm text-muted">No logs yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {area.logs.map((l) => (
                <LogRow key={l.id} log={l} focused={l.id === focusId} />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function AreaEditor({ area, onDone }: { area: FocusArea; onDone: () => void }) {
  const [name, setName] = useState(area.name);
  const [goal, setGoal] = useState(area.goal ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await updateFocusArea(area.id, name, goal);
          if (res.ok) onDone();
          else setMessage(res.message);
        });
      }}
      className="flex flex-col gap-2 bg-surface p-3 sm:p-4"
    >
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} aria-label="Name" style={{ outline: "none" }} className={`${field} font-semibold`} />
      <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} maxLength={2000} placeholder="The goal (optional)" aria-label="Goal" style={{ outline: "none" }} className={`${field} resize-y`} />
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
  );
}

// The add box inside an open focus area: date | the log [+ Notes] | Save.
// One log per day: picking a day that already has one loads it, and saving updates it.
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

function ComposerFields({
  areaId,
  date,
  existing,
  onDate,
}: {
  areaId: string;
  date: string;
  existing: FocusLog | null;
  onDate: (d: string) => void;
}) {
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
          setMessage(res.ok ? (existing ? "Updated." : "Logged.") : res.message);
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
            placeholder={existing ? "This day's log" : "Today's log: what you did / plan to do"}
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
          {pending ? "Saving…" : existing ? "Update" : "Log it"}
        </button>
      </div>
      {showNotes && (
        <div className="mt-3 border-t border-accent/20 pt-3">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={5000}
            placeholder="Notes (optional): how it went"
            aria-label="Notes (optional)"
            style={{ outline: "none" }}
            className={`${field} resize-y leading-relaxed`}
          />
        </div>
      )}
      {(message || existing) && (
        <p role="status" className={`mt-2 px-1 text-sm ${message && message !== "Updated." && message !== "Logged." ? "text-danger" : "text-muted"}`}>
          {message ?? "This day already has a log. Saving updates it."}
        </p>
      )}
    </form>
  );
}

function LogRow({ log, focused }: { log: FocusLog; focused: boolean }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const ref = useRef<HTMLLIElement>(null);
  const { day, month, weekday, long } = dateParts(log.entry_date);

  // Arrived from a search result: bring it into view while it flashes.
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focused]);

  async function remove() {
    const ok = await confirm({ title: "Delete this day's log?", body: `The log for ${long} will be removed for good.`, confirmLabel: "Delete" });
    if (ok) startTransition(() => deleteFocusLog(log.id));
  }

  if (editing) return <LogEditor log={log} onDone={() => setEditing(false)} />;

  return (
    <li
      ref={ref}
      className={`group flex gap-3 rounded-card bg-surface px-3 py-3 transition-opacity sm:gap-4 ${pending ? "opacity-40" : ""} ${focused ? "flash" : ""}`}
    >
      {/* Date: weekday / big day / month. */}
      <div className="w-10 shrink-0 text-center">
        <div className="text-[11px] text-muted">{weekday}</div>
        <div className="num font-display text-2xl font-semibold leading-tight">{day}</div>
        <div className="text-[11px] uppercase tracking-wide text-muted">{month}</div>
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="whitespace-pre-line break-words leading-relaxed text-ink">
          <Linkified text={log.log} />
        </p>
        {log.notes && (
          <p className="mt-2 whitespace-pre-line break-words border-t border-accent/20 pt-2 text-sm leading-relaxed text-ink/70">
            <Linkified text={log.notes} />
          </p>
        )}
      </div>
      <div className="-mr-1 -mt-1 flex shrink-0 items-start">
        <IconButton label={`Edit the log for ${long}`} onClick={() => setEditing(true)} disabled={pending}>
          <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />
        </IconButton>
        <IconButton label={`Delete the log for ${long}`} onClick={remove} disabled={pending} danger>
          <path d="M6 6l12 12M18 6L6 18" />
        </IconButton>
      </div>
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

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid size-8 place-items-center rounded-control text-muted opacity-50 transition hover:bg-paper group-hover:text-black group-hover:opacity-100 ${
        danger ? "hover:text-danger!" : ""
      }`}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}
