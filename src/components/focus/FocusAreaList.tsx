"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { deleteFocusArea, deleteFocusLog, saveFocusLog, updateFocusArea } from "@/app/focus/actions";
import type { FocusArea, FocusLog } from "@/lib/focus";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import DateWheel from "@/components/ui/DateWheel";
import { useToday } from "@/components/journal/useToday";
import { localNow } from "@/lib/month";
import AddFocusArea from "./AddFocusArea";

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
const FADE_MS = 160; // the band's fade out / in when you switch what's in it
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

// Left: the focus areas (just their names). Right: a black-bordered box with a placeholder until you
// pick one, then its add box on top and its logs below (newest first). Click the picked one again to close it.
export default function FocusAreaList({ recordId, areas, focusId }: { recordId: string; areas: FocusArea[]; focusId?: string }) {
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
        {areas.length > 0 && (
          <ul className="mb-2 space-y-2">
            {areas.map((a) => (
              <AreaCard key={a.id} area={a} selected={a.id === selected} onSelect={() => setSelected((cur) => (cur === a.id ? null : a.id))} onDeleted={() => a.id === selected && setSelected(null)} />
            ))}
          </ul>
        )}
        {/* The dashed "+ Add focus area" box under the list. */}
        <AddFocusArea recordId={recordId} />
      </section>

      {/* ---------- Right: the chosen focus area's logs ---------- */}
      <section
        aria-label={area ? `${area.name} logs` : "Logs"}
        className="relative flex h-[75dvh] min-h-[24rem] min-w-0 flex-col overflow-hidden rounded-card border-[1.5px] border-ink lg:h-auto lg:min-h-0 lg:flex-1"
      >
        {area ? (
          <AreaPanel key={area.id} area={area} focusId={focusId} />
        ) : (
          // Nothing picked: a dashed placeholder.
          <div className="m-3 grid flex-1 place-items-center rounded-card border-2 border-dashed border-line p-6 text-center text-muted sm:m-4">
            Click on a focus to edit
          </div>
        )}
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

// The right box for one focus area: name (+ goal) and buttons on top, then a band across the whole
// box for adding / editing, then the logs.
//
// The band shows today's add box while today has no log yet. Once today's logged it says "Click an
// entry to edit". The pencil on a log fades the band over to that day's edit box, and that log fades
// in the list with "Editing" (like the unsuspicious documents).
function AreaPanel({ area, focusId }: { area: FocusArea; focusId?: string }) {
  const today = useToday() ?? todayKey();
  const todayLogged = area.logs.some((l) => l.entry_date === today);
  const resting = todayLogged ? null : today; // where the add box sits when you're not doing anything
  const [editing, setEditing] = useState<string | null>(resting); // the day in the band; null = the message

  // Today just got logged (or the date rolled over): go back to resting.
  const [seenResting, setSeenResting] = useState(resting);
  if (resting !== seenResting) {
    setSeenResting(resting);
    setEditing(resting);
  }

  const [scrolled, setScrolled] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const jump = (to: "top" | "bottom") => {
    const el = scrollerRef.current;
    if (el) el.scrollTo({ top: to === "top" ? 0 : el.scrollHeight, behavior: "smooth" });
  };

  // The band fades out, swaps to what's asked for, then fades back in.
  const [shown, setShown] = useState(editing);
  const [fading, setFading] = useState(false);
  if (editing !== shown && !fading) setFading(true);
  useEffect(() => {
    if (!fading) return;
    const t = setTimeout(() => {
      setShown(editing);
      setFading(false);
    }, FADE_MS);
    return () => clearTimeout(t);
  }, [fading, editing]);

  const existing = shown ? (area.logs.find((l) => l.entry_date === shown) ?? null) : null;
  const canClose = shown !== null && shown !== resting; // the resting add box has nothing to close to

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
      </div>

      {/* The band: today's add box, the edit box for the day you clicked, or "Click an entry to edit". */}
      <div className="relative z-10 shrink-0 border-y border-accent/20 bg-line/50 px-4 py-3 sm:px-5">
        <div className={`transition-opacity duration-150 ease-out ${fading ? "opacity-0" : "opacity-100"}`}>
          {shown !== null ? (
            <ComposerFields
              key={`${shown}-${existing?.id ?? "new"}`}
              areaId={area.id}
              date={shown}
              existing={existing}
              onDate={setEditing}
              onSaved={(savedDate) => setEditing(todayLogged || savedDate === today ? null : today)}
              onClose={canClose ? () => setEditing(resting) : undefined}
            />
          ) : (
            <p className="grid h-11 place-items-center text-sm text-muted">Click an entry to edit</p>
          )}
        </div>
        {/* Fade under the band once the logs have scrolled. */}
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
          className="absolute inset-0 overflow-y-auto px-3 pb-4 pt-3 sm:px-4"
        >
          {area.logs.length === 0 ? (
            <p className="mt-1 rounded-card border border-dashed border-line px-5 py-6 text-muted">No logs yet.</p>
          ) : (
            <ul className="space-y-2">
              {area.logs.map((l) => (
                <LogRow
                  key={l.id}
                  log={l}
                  focused={l.id === focusId}
                  editing={l.entry_date === editing}
                  onEdit={() => setEditing(l.entry_date)}
                  onDeleted={() => l.entry_date === editing && setEditing(resting)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

// The add box: date | the log [+ Notes] | Add (or Update, when that day already has a log) [×].
function ComposerFields({
  areaId,
  date,
  existing,
  onDate,
  onSaved,
  onClose,
}: {
  areaId: string;
  date: string;
  existing: FocusLog | null;
  onDate: (d: string) => void;
  onSaved: (date: string) => void;
  onClose?: () => void;
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
          if (res.ok) onSaved(date);
          else setMessage(res.message);
        });
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="sm:w-32 sm:shrink-0">
          <DateWheel key={date} name="focus_date" defaultValue={date} onChange={onDate} noYear />
        </div>
        <div className="relative flex min-w-0 flex-1">
          <textarea
            autoFocus={Boolean(onClose)}
            value={log}
            onChange={(e) => setLog(e.target.value)}
            rows={1}
            maxLength={5000}
            placeholder="The log"
            aria-label="Log"
            style={{ outline: "none" }}
            // 44px tall on one line (same as the date box and Add), growing as you write more.
            className="field-sizing-content min-h-11 w-full resize-none rounded-control border border-line bg-paper py-2 pl-3 pr-24 leading-relaxed text-ink placeholder:text-muted/70 focus:border-ink"
          />
          {/* Centered in the one-line box: (44 - 28) / 2 = 8px from the top. */}
          <button
            type="button"
            onClick={() => setShowNotes((v) => !v)}
            aria-expanded={showNotes}
            className={`absolute right-1.5 top-2 rounded-[9px] px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              showNotes ? "bg-accent/15 text-accent" : "bg-surface text-muted hover:text-ink"
            }`}
          >
            {showNotes ? "− Notes" : "+ Notes"}
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="submit"
            disabled={pending}
            className="h-11 flex-1 rounded-control bg-accent px-5 font-semibold text-accent-ink shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Saving…" : existing ? "Update" : "Add"}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close the add box"
              title="Close"
              className="grid size-11 place-items-center rounded-control text-muted transition-colors hover:bg-surface hover:text-ink"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
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
      {message && (
        <p role="status" className="mt-2 px-1 text-sm text-danger">
          {message}
        </p>
      )}
    </form>
  );
}

// One day: date | log, folded (notes hidden). Click to show the notes. Faded while it's in the add box.
function LogRow({
  log,
  focused,
  editing,
  onEdit,
  onDeleted,
}: {
  log: FocusLog;
  focused: boolean;
  editing: boolean;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(focused);
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
    if (!ok) return;
    onDeleted();
    startTransition(() => deleteFocusLog(log.id));
  }

  return (
    <li ref={ref} className={`group relative rounded-card bg-surface px-3 py-2.5 transition-opacity sm:px-4 ${pending ? "opacity-40" : ""} ${focused ? "flash" : ""}`}>
      <div className={`transition-opacity duration-300 ${editing ? "opacity-20" : ""}`}>
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            disabled={!log.notes || editing}
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
          <div className={`-my-1 -mr-1 flex shrink-0 ${editing ? "invisible" : ""}`}>
            <IconButton label={`Edit the log for ${long}`} onClick={onEdit} disabled={pending}>
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
      </div>

      {editing && (
        <p className="absolute inset-0 grid place-items-center">
          <span className="rounded-full bg-paper px-4 py-1.5 font-display text-sm font-semibold text-muted shadow-sm">Editing</span>
        </p>
      )}
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
