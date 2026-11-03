"use client";

import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { deleteGratitude } from "@/app/gratitude/actions";
import type { GratitudeEntry } from "@/lib/gratitude";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import GratitudeForm from "./GratitudeForm";

// "2026-10-22" → { day: "22", weekday: "Thursday", short: "Oct 22" }
function dateParts(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    day: String(d),
    weekday: dt.toLocaleDateString("en-US", { weekday: "long" }),
    short: dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  };
}

export default function GratitudeList({
  entries,
  monthName,
  daysLogged,
  focusId,
  veiled = false,
}: {
  entries: GratitudeEntry[];
  monthName: string;
  daysLogged: number;
  focusId?: string; // an entry to scroll to and flash (from a search result)
  veiled?: boolean; // covered while the add box slides, so you don't see the list reflow
}) {
  const [scrolled, setScrolled] = useState(false); // shows the fade under the header

  return (
    // The bordered box on the right: fills the rest of the screen and scrolls inside itself.
    // Border thickness: border-[1.5px]. Phones: a fixed share of the screen, under the writing box.
    <section
      aria-labelledby="entries-heading"
      className="relative isolate flex h-[70dvh] min-h-[24rem] min-w-0 flex-col overflow-hidden rounded-card border-[1.5px] border-ink lg:h-auto lg:min-h-0 lg:flex-1"
    >
      {/* Mascots, pinned to the box's corners (they stay put while the entries scroll past).
          Fixed sizes, so they look the same whatever the box height. Trimmed by the border.
          Tweak per image: w-.. = size (sm:w-.. on bigger screens), top/right/bottom/left
          = position (negative pushes it past the edge), opacity-.. = fade, rotate-.. = tilt. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative */}
      <img
        src="/shaymin-sky.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-4 -right-8 -z-10 w-36 select-none opacity-70 -rotate-6 sm:w-44"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative */}
      <img
        src="/shaymin-land.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-6 -left-10 -z-10 w-40 select-none opacity-70 rotate-3 -scale-x-100 sm:w-48"
      />

      {/* Header: always visible at the top of the box. */}
      <div className="relative z-10 flex shrink-0 items-baseline justify-between gap-3 bg-paper px-5 pb-3 pt-4 sm:px-6">
        <h2 id="entries-heading" className="font-display text-xl font-semibold">
          {monthName}
        </h2>
        {daysLogged > 0 && (
          <p className="text-sm text-muted">
            {daysLogged} {daysLogged === 1 ? "day" : "days"} of remembering to do ts
          </p>
        )}
        {/* Fade under the header once the entries have scrolled. Height: h-6. */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 top-full h-6 bg-gradient-to-b from-paper to-transparent transition-opacity duration-200 ${
            scrolled ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>

      {/* The scrolling part. */}
      <div
        data-scroller
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
        className="relative z-[1] min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-5 [scrollbar-width:thin] [scrollbar-color:var(--line)_transparent]"      >
        {entries.length === 0 ? (
          <p className="mt-1 rounded-card border border-dashed border-line px-5 py-6 text-muted">
            Nothing yet for {monthName}. What are three good things from today?
          </p>
        ) : (
          <ul className="divide-y-[3px] divide-ink/30">
            {entries.map((e) => (
              <EntryCard key={e.id} entry={e} focused={e.id === focusId} />
            ))}
          </ul>
        )}
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

function EntryCard({ entry, focused }: { entry: GratitudeEntry; focused: boolean }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const ref = useRef<HTMLLIElement>(null);
  const { day, weekday, short } = dateParts(entry.entry_date);

  // Arrived here from a search result: scroll the box (not the page) so this entry is centered.
  useEffect(() => {
    const el = ref.current;
    const scroller = el?.closest<HTMLElement>("[data-scroller]");
    if (!focused || !el || !scroller) return;
    scroller.scrollTo({
      top: el.offsetTop - scroller.clientHeight / 2 + el.offsetHeight / 2,
      behavior: "smooth",
    });
  }, [focused]);

  async function remove() {
    const ok = await confirm({
      title: "Delete this entry?",
      body: `Your three things from ${short} will be removed for good.`,
      confirmLabel: "Delete",
    });
    if (ok) startTransition(() => deleteGratitude(entry.id));
  }

  if (editing) {
    return (
      <li className="my-2 rounded-card bg-surface p-4 sm:p-5">
        <GratitudeForm entry={entry} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li
      ref={ref}
      className={`group flex gap-3 px-2 py-4 transition-opacity sm:gap-5 sm:px-3 ${pending ? "opacity-40" : ""} ${
        focused ? "flash rounded-control" : ""
      }`}
      // The flash normally fades back to the oat box color; these entries have no box, so fade to clear.
      style={focused ? ({ "--surface": "transparent" } as CSSProperties) : undefined}
    >
      {/* Date: big day number, weekday under it. */}
      <div className="w-10 shrink-0 text-center sm:w-14">
        <div className="num font-display text-2xl font-semibold leading-none sm:text-3xl">{day}</div>
        <div className="mt-1 text-xs text-muted">{weekday.slice(0, 3)}</div>
      </div>

      {/* The three things, each with its cinnamon numeral. */}
      <ol className="min-w-0 flex-1 space-y-1.5">
        {[entry.first, entry.second, entry.third].map((thing, i) => (
          <li key={i} className="flex items-baseline gap-3">
            <span aria-hidden="true" className="num w-4 shrink-0 font-display font-semibold text-accent">
              {i + 1}
            </span>
            <span className="min-w-0 break-words text-ink">{thing}</span>
          </li>
        ))}
      </ol>

      <div className="-mr-1 -mt-1 flex shrink-0 flex-col items-start sm:flex-row">
        <button
          type="button"
          disabled={pending}
          onClick={() => setEditing(true)}
          aria-label={`Edit entry from ${short}`}
          className="grid size-8 place-items-center rounded-control text-muted opacity-50 transition hover:bg-paper group-hover:text-black group-hover:opacity-100"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={remove}
          aria-label={`Delete entry from ${short}`}
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
