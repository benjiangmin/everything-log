"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { deleteBibleEntry, loadBibleDay, saveBibleDay, type BibleDraft } from "@/app/bible/actions";
import type { BibleEntry } from "@/lib/bible";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import DateWheel from "@/components/ui/DateWheel";
import RichText from "@/components/dreams/RichText";
import { useToday } from "@/components/journal/useToday";
import { VEIL_EVENT } from "@/components/journal/veil";
import { planFor } from "@/lib/bible-plan";
import Mascot from "@/components/ui/Mascot";

const pad = (n: number) => String(n).padStart(2, "0");
const AUTOSAVE_MS = 1200; // today's entry saves this long after you stop typing
// Slide timing (same as the unsuspicious documents): veil fades in (150ms) → box slides (450ms) → veil lifts.
const VEIL_MS = 620;

function parts(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    day: String(d),
    weekday: dt.toLocaleDateString("en-US", { weekday: "short" }),
    long: dt.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }),
  };
}

const EMPTY: BibleDraft = { ot: "", otNotes: "", nt: "", ntNotes: "" };
// A saved day as it is; an empty day starts with that date's reading-plan passages filled in.
const draftOf = (e: BibleEntry | null, date: string): BibleDraft => {
  if (e) return { ot: e.ot, otNotes: e.otNotes, nt: e.nt, ntNotes: e.ntNotes };
  const plan = planFor(date); // none on Feb 29
  return plan ? { ...EMPTY, ot: plan.ot, nt: plan.nt } : EMPTY;
};

// The day loaded into the writing box. `version` bumps on every load, which resets the boxes.
type Day = { date: string; exists: boolean; start: BibleDraft; version: number };

// Left: the writing box (Old Testament passage + notes, then New Testament passage + notes).
// Right: the month's days, folded to just the passages until you click one.
//
// Works like the unsuspicious documents: the writing box is a slim strip until you open it; today
// saves itself as you type; any other day has Save / Cancel.
export default function BibleWorkspace({
  year,
  month,
  monthName,
  entries,
  focusId,
}: {
  year: number;
  month: number; // 1–12
  monthName: string;
  entries: BibleEntry[];
  focusId?: string;
}) {
  const today = useToday();
  const confirm = useConfirm();
  const [day, setDay] = useState<Day | null>(null); // null = closed
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<BibleDraft>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const edits = useRef(0); // counts changes, so a save doesn't mark newer typing as saved
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const version = useRef(0);

  // "Write" opens today if today is in this year, otherwise the 1st of the month you're viewing.
  const todayInYear = today !== null && today.startsWith(`${year}-`);
  const writeDate = todayInYear ? today! : `${year}-${pad(month)}-01`;
  const isToday = day !== null && day.date === today;

  const save = useCallback(async (target: Day, content: BibleDraft, quiet: boolean) => {
    const at = edits.current;
    setSaving(true);
    if (quiet) setStatus({ text: "Saving…" });
    const res = await saveBibleDay(target.date, content);
    setSaving(false);
    if (!res.ok) {
      setStatus({ text: res.message, error: true });
      return false;
    }
    if (edits.current === at) setDirty(false);
    setDay((d) => (d && d.date === target.date ? { ...d, exists: res.exists } : d));
    const time = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    setStatus({ text: `Latest updates saved · ${time}` });
    return true;
  }, []);

  // Before leaving the current day: today's changes get saved, another day's ask first.
  const settle = useCallback(async () => {
    clearTimeout(timer.current);
    if (!day || !dirty) return true;
    if (day.date === today) return save(day, draft, true);
    const ok = await confirm({
      title: `Save your changes to ${parts(day.date).long} first?`,
      body: "To throw them away instead, press Cancel in the writing box.",
      confirmLabel: "Save",
    });
    return ok && (await save(day, draft, false));
  }, [day, dirty, draft, today, confirm, save]);

  const open = useCallback(
    async (date: string, opts: { preset?: BibleEntry; discard?: boolean } = {}) => {
      if (!opts.discard && !(await settle())) return;
      clearTimeout(timer.current);
      setLoading(true);
      const entry = opts.preset ?? (await loadBibleDay(date).catch(() => null));
      setLoading(false);
      version.current += 1;
      const start = draftOf(entry, date);
      setDay({ date, exists: Boolean(entry), start, version: version.current });
      setDraft(start);
      setDirty(false);
      setStatus(null);
    },
    [settle],
  );

  const close = useCallback(
    async (opts: { discard?: boolean } = {}) => {
      if (!opts.discard && !(await settle())) return;
      clearTimeout(timer.current);
      setDay(null);
      setDirty(false);
      setStatus(null);
    },
    [settle],
  );

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function change(patch: Partial<BibleDraft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    setDirty(true);
    edits.current += 1;
    if (day && isToday) {
      clearTimeout(timer.current);
      const target = day;
      timer.current = setTimeout(() => save(target, next, true), AUTOSAVE_MS);
    }
  }

  const editingDate = day && !isToday ? day.date : null;
  const expanded = day !== null;

  // While the writing box slides, an oat veil covers the entries so you don't see them reflow.
  const [veil, setVeil] = useState(0);
  const [wasExpanded, setWasExpanded] = useState(expanded);
  if (wasExpanded !== expanded) {
    setWasExpanded(expanded);
    setVeil((v) => v + 1);
  }
  useEffect(() => {
    if (!veil) return;
    const t = setTimeout(() => setVeil(0), VEIL_MS);
    return () => clearTimeout(t);
  }, [veil]);

  return (
    <div className="mt-6 flex flex-col gap-6 lg:min-h-[32rem] lg:flex-1 lg:basis-0 lg:flex-row">
      {/* ---------- Left: the writing box (slides between a slim strip and half the page) ---------- */}
      <section
        aria-label="Write"
        style={{ "--panel-w": expanded ? "calc(50% - 0.75rem)" : "4.5rem" } as CSSProperties}
        className={`relative z-[25] flex shrink-0 flex-col rounded-card bg-surface transition-[width,padding] delay-150 duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none lg:h-auto lg:w-[var(--panel-w)] ${
          expanded ? "h-[80dvh] min-h-[24rem] p-4 sm:p-5" : "p-3 lg:overflow-hidden lg:px-0 lg:py-4"
        }`}
      >
        {!expanded ? (
          <ClosedStrip
            key="closed"
            label={todayInYear ? "Write today" : `Write in ${monthName}`}
            loading={loading}
            onWrite={() => open(writeDate)}
          />
        ) : (
          <div key={`open-${day.version}`} className="panel-in flex min-h-0 flex-1 flex-col">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="font-display text-xl font-semibold">{day.exists ? "Edit entry" : "Add entry"}</h2>
                <p className="text-sm text-muted">{isToday ? "Today" : parts(day.date).long}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {todayInYear && !isToday && (
                  <button
                    type="button"
                    onClick={() => open(today!)}
                    className="rounded-control px-3 py-2 text-sm font-semibold text-accent transition-colors hover:bg-paper"
                  >
                    ← Today
                  </button>
                )}
                <div className="w-44">
                  <DateWheel key={`${day.date}-${day.version}`} name="bible_date" defaultValue={day.date} onChange={(date) => open(date)} />
                </div>
                <button
                  type="button"
                  onClick={() => close()}
                  aria-label="Close the writing box"
                  title="Close"
                  className="grid size-10 place-items-center rounded-control text-muted transition-colors hover:bg-paper hover:text-ink"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>

            {/* The two readings. Scrolls inside the box if the notes get long. */}
            <div key={day.version} className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1 pb-1">
              <Reading
                title="Old Testament"
                passage={day.start.ot}
                notes={day.start.otNotes}
                example="e.g. Isaiah 39:1-40:31"
                onPassage={(ot) => change({ ot })}
                onNotes={(otNotes) => change({ otNotes })}
              />
              <Reading
                title="New Testament"
                passage={day.start.nt}
                notes={day.start.ntNotes}
                example="e.g. Colossians 4"
                onPassage={(nt) => change({ nt })}
                onNotes={(ntNotes) => change({ ntNotes })}
              />
            </div>

            <div className="mt-3 flex min-h-10 flex-wrap items-center gap-3">
              {(!isToday || !day.exists) && (
                <>
                  <button
                    type="button"
                    disabled={saving || (day.exists && !dirty)}
                    onClick={async () => {
                      if (await save(day, draft, false)) close({ discard: true });
                    }}
                    className="rounded-control bg-accent px-5 py-2.5 font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? "Saving…" : day.exists ? "Save changes" : "Add entry"}
                  </button>
                  <button
                    type="button"
                    onClick={() => close({ discard: true })}
                    className="rounded-control px-4 py-2.5 text-muted transition-colors hover:bg-paper hover:text-ink"
                  >
                    Cancel
                  </button>
                </>
              )}
              <p role="status" className={`text-sm ${status?.error ? "text-danger" : "text-muted"}`}>
                {status?.text ??
                  (!day.exists && planFor(day.date)
                    ? "Passages filled in from the reading plan."
                    : isToday
                      ? "Saves automatically as you type."
                      : "")}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ---------- Right: the month's days ---------- */}
      <EntryList
        entries={entries}
        year={year}
        monthName={monthName}
        veiled={veil > 0}
        editingDate={editingDate}
        focusId={focusId}
        onEdit={(e) => open(e.date, { preset: e })}
        onDeleted={(e) => {
          if (day?.date === e.date) close({ discard: true });
        }}
      />
    </div>
  );
}

// One reading in the writing box: its name, the passage, then notes.
function Reading({
  title,
  passage,
  notes,
  example,
  onPassage,
  onNotes,
}: {
  title: string;
  passage: string;
  notes: string;
  example: string;
  onPassage: (v: string) => void;
  onNotes: (v: string) => void;
}) {
  return (
    <div className="rounded-card bg-paper/60 p-3 ring-1 ring-line">
      <div className="mb-2 flex items-center gap-3">
        <p className="w-32 shrink-0 font-display text-sm font-semibold uppercase tracking-wide text-muted">{title}</p>
        <input
          defaultValue={passage}
          onChange={(e) => onPassage(e.target.value)}
          maxLength={200}
          placeholder={example}
          aria-label={`${title} passage`}
          style={{ outline: "none" }}
          className="min-w-0 flex-1 rounded-control border border-line bg-paper px-3 py-2 font-medium text-ink placeholder:font-normal placeholder:text-muted/70 focus:border-ink"
        />
      </div>
      <RichText initial={notes} onChange={onNotes} onFiles={() => {}} placeholder="Notes…" label={`${title} notes`} />
    </div>
  );
}

function ClosedStrip({ label, loading, onWrite }: { label: string; loading: boolean; onWrite: () => void }) {
  return (
    <div className="panel-in flex items-center justify-between gap-3 lg:h-full lg:flex-col lg:justify-start lg:gap-5">
      <button
        type="button"
        onClick={onWrite}
        disabled={loading}
        aria-label={label}
        title={label}
        className="flex items-center gap-2 rounded-control bg-accent px-4 py-2.5 font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60 lg:size-11 lg:justify-center lg:p-0"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="lg:sr-only">{label}</span>
      </button>
      <p className="text-sm text-muted lg:rotate-180 lg:[writing-mode:vertical-rl]">{loading ? "Opening…" : "Click an entry to edit"}</p>
    </div>
  );
}

function EntryList({
  entries,
  year,
  monthName,
  veiled,
  editingDate,
  focusId,
  onEdit,
  onDeleted,
}: {
  entries: BibleEntry[];
  year: number;
  monthName: string;
  veiled: boolean;
  editingDate: string | null;
  focusId?: string;
  onEdit: (e: BibleEntry) => void;
  onDeleted: (e: BibleEntry) => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Search jump: fade to oat, jump to the entry behind the veil, lift it with the entry flashing.
  const [searchVeil, setSearchVeil] = useState<"none" | "pending" | "landed">(focusId ? "landed" : "none");
  const [seenFocus, setSeenFocus] = useState(focusId);
  if (focusId !== seenFocus) {
    setSeenFocus(focusId);
    if (focusId) setSearchVeil("landed");
  }
  useEffect(() => {
    const onVeil = () => setSearchVeil("pending");
    window.addEventListener(VEIL_EVENT, onVeil);
    return () => window.removeEventListener(VEIL_EVENT, onVeil);
  }, []);
  useEffect(() => {
    if (searchVeil === "none") return;
    const t = setTimeout(() => setSearchVeil("none"), searchVeil === "landed" ? 350 : 2500);
    return () => clearTimeout(t);
  }, [searchVeil]);

  const jump = (to: "top" | "bottom") => {
    const el = scrollerRef.current;
    if (el) el.scrollTo({ top: to === "top" ? 0 : el.scrollHeight, behavior: "smooth" });
  };

  // Opening a month starts at the bottom (the newest day). Skipped when a search picked an entry.
  const monthKey = `${year}-${monthName}`;
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller && !focusId) scroller.scrollTop = scroller.scrollHeight;
    // Only when the month changes (not after saving or deleting).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey]);

  return (
    <section
      aria-labelledby="entries-heading"
      className="relative isolate flex h-[75dvh] min-h-[24rem] min-w-0 flex-col overflow-hidden rounded-card border-[1.5px] border-ink lg:h-auto lg:min-h-0 lg:flex-1"
    >
      {/* Mascot: pinned to the box's bottom-right corner (see Mascot.tsx to tweak). */}
      <Mascot name="arceus" corner="right" />
      <div className="relative z-10 flex shrink-0 items-baseline justify-between gap-3 bg-paper px-5 pb-3 pt-4 sm:px-6">
        <h2 id="entries-heading" className="font-display text-xl font-semibold">
          {monthName} <span className="num font-normal text-muted">{year}</span>
        </h2>
        {entries.length > 0 && (
          <div className="flex items-center gap-1">
            <p className="mr-1 text-sm text-muted">
              {entries.length} {entries.length === 1 ? "day" : "days"}
            </p>
            <JumpButton label="Jump to the start of the month" onClick={() => jump("top")} dir="up" />
            <JumpButton label="Jump to the end of the month" onClick={() => jump("bottom")} dir="down" />
          </div>
        )}
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
          {entries.length === 0 ? (
            <p className="mt-1 rounded-card border border-dashed border-line px-5 py-6 text-muted">No readings in {monthName} yet.</p>
          ) : (
            <ul ref={listRef} className="space-y-2">
              {entries.map((e) => (
                <Entry
                  key={e.id}
                  entry={e}
                  editing={e.date === editingDate}
                  focused={e.id === focusId}
                  onEdit={() => onEdit(e)}
                  onDeleted={() => onDeleted(e)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* The veil: covers the entries while the writing box slides (and during a search jump). */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 z-20 bg-surface ${searchVeil !== "none" ? "block" : "hidden lg:block"} ${
          veiled || searchVeil !== "none" ? "opacity-100 duration-150" : "opacity-0 duration-300"
        } transition-opacity ease-out motion-reduce:hidden`}
      />
    </section>
  );
}

// One day. Folded: just the passages. Click it to see the notes under each.
function Entry({
  entry,
  editing,
  focused,
  onEdit,
  onDeleted,
}: {
  entry: BibleEntry;
  editing: boolean;
  focused: boolean;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(focused); // folded by default (a search result opens itself)
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const ref = useRef<HTMLLIElement>(null);
  const { day, weekday, long } = parts(entry.date);
  const hasNotes = Boolean(entry.otNotes || entry.ntNotes);

  // Arrived from a search result: jump the box (not the page) to this entry, behind the veil.
  useLayoutEffect(() => {
    const el = ref.current;
    const scroller = el?.closest<HTMLElement>("[data-scroller]");
    if (!focused || !el || !scroller) return;
    scroller.scrollTo({ top: el.offsetTop - 12, behavior: "instant" });
  }, [focused]);

  async function remove() {
    const ok = await confirm({ title: "Delete this day?", body: `Your entry for ${long} will be removed for good.`, confirmLabel: "Delete" });
    if (!ok) return;
    onDeleted();
    startTransition(() => deleteBibleEntry(entry.id));
  }

  return (
    <li
      ref={ref}
      className={`group relative flex gap-3 rounded-card bg-surface px-3 py-3 transition-opacity ${pending ? "opacity-40" : ""} ${
        focused ? "flash" : ""
      }`}
    >
      <div className={`flex min-w-0 flex-1 gap-3 transition-opacity duration-300 ${editing ? "opacity-20" : ""}`}>
        <div className="w-10 shrink-0 text-center">
          <div className="text-xs text-muted">{weekday}</div>
          <div className="num font-display text-2xl font-semibold leading-tight">{day}</div>
        </div>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            disabled={!hasNotes}
            className="flex w-full items-start gap-2 pt-0.5 text-left disabled:cursor-default"
          >
            <span className="min-w-0 flex-1 space-y-0.5">
              <Passage label="OT" text={entry.ot} />
              <Passage label="NT" text={entry.nt} />
            </span>
            {hasNotes && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className={`mt-1 shrink-0 text-muted/70 transition-transform ${open ? "rotate-180" : ""}`}
              >
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>

          {open && hasNotes && (
            <div className="mt-2 space-y-3 border-t border-accent/20 pt-3">
              <Notes title={entry.ot || "Old Testament"} html={entry.otNotes} />
              <Notes title={entry.nt || "New Testament"} html={entry.ntNotes} />
            </div>
          )}
        </div>
      </div>

      {editing ? (
        <p className="absolute inset-0 grid place-items-center">
          <span className="rounded-full bg-paper px-4 py-1.5 font-display text-sm font-semibold text-muted shadow-sm">Editing</span>
        </p>
      ) : (
        <div className="-mr-1 flex shrink-0 flex-col items-start sm:flex-row">
          <button
            type="button"
            disabled={pending}
            onClick={onEdit}
            aria-label={`Edit entry from ${long}`}
            className="grid size-8 place-items-center rounded-control text-muted opacity-50 transition hover:bg-paper group-hover:text-black group-hover:opacity-100"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            aria-label={`Delete entry from ${long}`}
            className="grid size-8 place-items-center rounded-control text-muted opacity-50 transition hover:bg-paper hover:text-danger! group-hover:text-black group-hover:opacity-100"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
    </li>
  );
}

// "OT  Isaiah 39:1-40:31" (or a dash if that reading was left empty).
function Passage({ label, text }: { label: string; text: string }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="w-6 shrink-0 text-[11px] font-semibold tracking-wide text-muted/70">{label}</span>
      <span className={`min-w-0 break-words ${text ? "font-medium text-ink" : "text-muted/60"}`}>{text || "—"}</span>
    </span>
  );
}

// A reading's notes in the opened entry (nothing if it has none).
function Notes({ title, html }: { title: string; html: string }) {
  if (!html) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      {/* Saved notes are cleaned to paragraphs, bold/italic/underline and lists before they get here. */}
      <div className="dream-text break-words text-[15px] leading-relaxed text-ink" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
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
