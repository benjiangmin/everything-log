"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { GratitudeEntry } from "@/lib/gratitude";
import { useToday } from "@/components/journal/useToday";
import GratitudeForm from "./GratitudeForm";
import GratitudeList from "./GratitudeList";

// Same slide as Something new I've learned: veil fades in (150ms) → box slides
// (starts at 150ms, takes 450ms) → veil lifts at VEIL_MS.
const VEIL_MS = 620;

// Left: the writing box. Its ‹ folds it away any time. Open by default; once today's three things are in it slides sideways into a
// slim strip (click it to slide back open) and the list on the right widens.
export default function GratitudeWorkspace({
  defaultDate,
  daysWithEntries,
  serverToday,
  entries,
  monthName,
  daysLogged,
  focusId,
}: {
  defaultDate?: string;
  daysWithEntries: string[]; // recent days that already have an entry
  serverToday: string; // a first guess until the browser's own date is known
  entries: GratitudeEntry[];
  monthName: string;
  daysLogged: number;
  focusId?: string;
}) {
  const today = useToday() ?? serverToday;
  const addedToday = daysWithEntries.includes(today);
  const [open, setOpen] = useState(!addedToday);

  // Today's entry just got added (or the date rolled over): fold / unfold to match.
  const [seen, setSeen] = useState(addedToday);
  if (seen !== addedToday) {
    setSeen(addedToday);
    setOpen(!addedToday);
  }

  // While the box slides, an oat veil covers the list so you don't see it reflow.
  const [veil, setVeil] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    setVeil((v) => v + 1);
  }
  useEffect(() => {
    if (!veil) return;
    const t = setTimeout(() => setVeil(0), VEIL_MS);
    return () => clearTimeout(t);
  }, [veil]);

  return (
    <div className="mt-4 flex flex-col gap-6 lg:min-h-[32rem] lg:flex-1 lg:basis-0 lg:flex-row">
      {/* Width slides between 24rem (open) and a 4.5rem strip. delay-150 = wait for the veil.
          z-[25] keeps the date picker above the list. */}
      <section
        aria-label="New entry"
        style={{ "--panel-w": open ? "24rem" : "4.5rem" } as CSSProperties}
        className={`relative z-[25] flex shrink-0 flex-col rounded-card bg-surface transition-[width,padding] delay-150 duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none lg:w-[var(--panel-w)] ${
          open ? "p-4 sm:p-5" : "p-3 lg:overflow-hidden lg:px-0 lg:py-4"
        }`}
      >
        {open ? (
          <div key="open" className="panel-in lg:w-[calc(24rem-2.5rem)]">
            <GratitudeForm defaultDate={defaultDate} onFold={() => setOpen(false)} />
          </div>
        ) : (
          // Folded: a slim strip on wide screens (reads bottom-to-top), a short bar on phones.
          <div key="closed" className="panel-in flex items-center justify-between gap-3 lg:h-full lg:flex-col lg:justify-start lg:gap-5">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Write another entry"
              title="Write another entry"
              className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-control bg-accent px-4 py-2.5 font-semibold text-accent-ink transition-opacity hover:opacity-90 lg:size-11 lg:justify-center lg:p-0"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <span className="lg:sr-only">Write another</span>
            </button>
            <p className="flex items-center gap-1.5 text-sm text-muted lg:rotate-180 lg:[writing-mode:vertical-rl]">
              {addedToday && (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-accent lg:hidden">
                  <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {addedToday ? "Update entry for today" : "Fill out entry for today"}
            </p>
          </div>
        )}
      </section>

      <GratitudeList entries={entries} monthName={monthName} daysLogged={daysLogged} focusId={focusId} veiled={veil > 0} />
    </div>
  );
}
