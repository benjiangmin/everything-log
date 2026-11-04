"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { Letter } from "@/lib/letters";
import LetterForm from "./LetterForm";
import LetterItem from "./LetterItem";

// Same slide as the other apps: veil fades in (150ms) → box slides (starts at 150ms, takes 450ms)
// → veil lifts at VEIL_MS.
const VEIL_MS = 620;
const OPEN_W = "30rem";

// Left: the writing box (‹ slides it to a slim strip, + slides it back). Right: past letters.
export default function LettersWorkspace({ past, today }: { past: Letter[]; today: string }) {
  const [open, setOpen] = useState(true);
  const [scrolled, setScrolled] = useState(false);

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
      {/* z-[25] keeps the date picker above the list. */}
      <section
        aria-label="Write a letter"
        style={{ "--panel-w": open ? OPEN_W : "4.5rem" } as CSSProperties}
        className={`relative z-[25] flex shrink-0 flex-col self-stretch rounded-card bg-surface transition-[width,padding] delay-150 duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none lg:w-[var(--panel-w)] ${
          open ? "p-4 sm:p-5" : "p-3 lg:overflow-hidden lg:px-0 lg:py-4"
        }`}
      >
        {open ? (
          <div key="open" className="panel-in lg:w-[calc(30rem-2.5rem)]">
            <LetterForm today={today} onFold={() => setOpen(false)} />
          </div>
        ) : (
          // Folded: a slim strip on wide screens (reads bottom-to-top), a short bar on phones.
          <div key="closed" className="panel-in flex items-center justify-between gap-3 lg:h-full lg:flex-col lg:justify-start lg:gap-5">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Write a letter"
              title="Write a letter"
              className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-control bg-accent px-4 py-2.5 font-semibold text-accent-ink transition-opacity hover:opacity-90 lg:size-11 lg:justify-center lg:p-0"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <span className="lg:sr-only">Write a letter</span>
            </button>
            <p className="text-sm text-muted lg:rotate-180 lg:[writing-mode:vertical-rl]">Write a letter</p>
          </div>
        )}
      </section>

      {/* ---------- Past letters: always open; each letter folded ---------- */}
      <section
        aria-labelledby="past-heading"
        className="relative flex h-[75dvh] min-h-[24rem] min-w-0 flex-col overflow-hidden rounded-card border-[1.5px] border-ink lg:h-auto lg:min-h-0 lg:flex-1"
      >
        <div className="relative z-10 flex shrink-0 items-baseline justify-between gap-3 bg-paper px-5 pb-3 pt-4 sm:px-6">
          <h2 id="past-heading" className="font-display text-xl font-semibold">
            Past letters
          </h2>
          <p className="num text-sm text-muted">{past.length}</p>
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-x-0 top-full h-5 bg-gradient-to-b from-paper to-transparent transition-opacity duration-200 ${
              scrolled ? "opacity-100" : "opacity-0"
            }`}
          />
        </div>
        {/* scrollbar-gutter: room for the scrollbar is always kept, so opening a letter never
            changes the box's width. */}
        <div
          onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
          className="relative z-[1] min-h-0 flex-1 overflow-y-auto px-3 pb-4 [scrollbar-gutter:stable] [scrollbar-width:thin] sm:px-4"
        >
          {past.length === 0 ? (
            <p className="mt-1 rounded-card border border-dashed border-line px-5 py-6 text-muted">No letters yet. Read one from your inbox and it lands here.</p>
          ) : (
            <ul className="space-y-2">
              {past.map((l) => (
                <LetterItem key={l.id} letter={l} today={today} />
              ))}
            </ul>
          )}
        </div>

        {/* The veil (wide screens): covers the list while the writing box slides. */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 z-20 hidden bg-surface transition-opacity ease-out motion-reduce:hidden lg:block ${
            veil > 0 ? "opacity-100 duration-150" : "opacity-0 duration-300"
          }`}
        />
      </section>
    </div>
  );
}
