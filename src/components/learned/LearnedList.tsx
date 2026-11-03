"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { deleteLearned } from "@/app/learned/actions";
import type { LearnedEntry } from "@/lib/learned";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import LearnedForm from "./LearnedForm";
import Mascot from "@/components/ui/Mascot";

// "2024-03-05" → { day: "5", weekday: "Tue", short: "Mar 5" }
function dateParts(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    day: String(d),
    weekday: dt.toLocaleDateString("en-US", { weekday: "short" }),
    short: dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  };
}

// Entries in runs of the same day (they come in newest-day-first already).
function byDay(entries: LearnedEntry[]) {
  const days: { date: string; items: LearnedEntry[] }[] = [];
  for (const e of entries) {
    const last = days.at(-1);
    if (last && last.date === e.entry_date) last.items.push(e);
    else days.push({ date: e.entry_date, items: [e] });
  }
  return days;
}

// The month's list: a bordered box that scrolls inside itself (on wide screens it fills the height).
export default function LearnedList({
  entries,
  monthName,
  year,
  focusId,
  veiled = false,
}: {
  entries: LearnedEntry[];
  monthName: string;
  year: string;
  focusId?: string;
  veiled?: boolean; // covered while the add box slides, so you don't see the list reflow
}) {
  const [scrolled, setScrolled] = useState(false);

  return (
    <section
      aria-labelledby="learned-heading"
      className="relative isolate flex h-[70dvh] min-h-[24rem] min-w-0 flex-col overflow-hidden rounded-card border-[1.5px] border-ink lg:h-auto lg:min-h-0 lg:flex-1"
    >
      {/* Mascots: pinned to the box's bottom corners (see Mascot.tsx to tweak). */}
      <Mascot name="aipom" corner="left" />
      <Mascot name="combee" corner="right" />
      <div className="relative z-10 flex shrink-0 items-baseline justify-between gap-3 bg-paper px-5 pb-3 pt-4 sm:px-6">
        <h2 id="learned-heading" className="font-display text-xl font-semibold">
          {monthName} <span className="num font-normal text-muted">{year}</span>
        </h2>
        {entries.length > 0 && (
          <p className="text-sm text-muted">
            {entries.length} new {entries.length === 1 ? "thing" : "things"}
          </p>
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
          data-scroller
          onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
          className="absolute inset-0 overflow-y-auto px-3 pb-4 sm:px-4"
        >
          {entries.length === 0 ? (
            <p className="mt-1 rounded-card border border-dashed border-line px-5 py-6 text-muted">
              Nothing yet for {monthName}. Learn anything today?
            </p>
          ) : (
            <ul className="space-y-2">
              {byDay(entries).map((d) => (
                <Day key={d.date} date={d.date} focused={d.items.some((e) => e.id === focusId)}>
                  {d.items.map((e) => (
                    <Entry key={e.id} entry={e} focused={e.id === focusId} />
                  ))}
                </Day>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* The veil (wide screens): covers the list while the add box slides. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 z-20 hidden bg-surface transition-opacity ease-out motion-reduce:hidden lg:block ${
          veiled ? "opacity-100 duration-150" : "opacity-0 duration-300"
        }`}
      />
    </section>
  );
}

// One day: the date on the left, that day's things on the right.
// The whole card flashes when you arrive from a search result for something in it.
function Day({ date, focused, children }: { date: string; focused: boolean; children: ReactNode }) {
  const { day, weekday } = dateParts(date);
  return (
    <li className={`flex gap-3 rounded-card bg-surface px-3 py-3 sm:gap-4 ${focused ? "flash" : ""}`}>
      <div className="w-10 shrink-0 pt-0.5 text-center">
        <div className="text-xs text-muted">{weekday}</div>
        <div className="num font-display text-2xl font-semibold leading-tight">{day}</div>
      </div>
      <ul className="min-w-0 flex-1 divide-y divide-accent/15">{children}</ul>
    </li>
  );
}

function Entry({ entry, focused }: { entry: LearnedEntry; focused: boolean }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const ref = useRef<HTMLLIElement>(null);
  const { short } = dateParts(entry.entry_date);

  // Arrived from a search result: scroll the box (not the page) to it while it flashes.
  useEffect(() => {
    const el = ref.current;
    const scroller = el?.closest<HTMLElement>("[data-scroller]");
    if (!focused || !el || !scroller) return;
    const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    scroller.scrollTo({ top: top - scroller.clientHeight / 2 + el.offsetHeight / 2, behavior: "smooth" });
  }, [focused]);

  async function remove() {
    const ok = await confirm({ title: "Delete this?", body: `What you learned on ${short} will be removed for good.`, confirmLabel: "Delete" });
    if (ok) startTransition(() => deleteLearned(entry.id));
  }

  if (editing) {
    return (
      <li className="py-2 first:pt-0 last:pb-0">
        <LearnedForm entry={entry} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li
      ref={ref}
      className={`group flex gap-2 py-2 transition-opacity first:pt-0.5 last:pb-0 ${pending ? "opacity-40" : ""}`}
    >
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-line break-words leading-relaxed text-ink">{entry.fact}</p>
        {entry.source && <p className="mt-0.5 break-words text-sm text-muted">from {entry.source}</p>}
      </div>
      <div className="-mr-1 -mt-0.5 flex shrink-0 items-start">
        <button
          type="button"
          disabled={pending}
          onClick={() => setEditing(true)}
          aria-label={`Edit what you learned on ${short}`}
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
          aria-label={`Delete what you learned on ${short}`}
          className="grid size-8 place-items-center rounded-control text-muted opacity-50 transition hover:bg-paper hover:text-danger! group-hover:text-black group-hover:opacity-100"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </li>
  );
}
