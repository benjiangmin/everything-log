"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { Subscription } from "@/lib/subscriptions";
import SubscriptionForm from "./SubscriptionForm";
import SubscriptionList from "./SubscriptionList";

// Same slide as the other apps: veil fades in (150ms) → box slides (starts at 150ms, takes
// 450ms) → veil lifts at VEIL_MS.
const VEIL_MS = 620;
const OPEN_W = "28rem";

// Left: the add box. Open while there's nothing on the list yet; once there is, it starts folded
// to a slim strip (click it to slide back open, ‹ to fold it again). Right: the list, which widens.
export default function SubscriptionsWorkspace({ subs }: { subs: Subscription[] }) {
  const [open, setOpen] = useState(subs.length === 0);

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
        aria-label="Add a subscription"
        style={{ "--panel-w": open ? OPEN_W : "4.5rem" } as CSSProperties}
        className={`relative z-[25] flex shrink-0 flex-col self-stretch rounded-card bg-surface transition-[width,padding] delay-150 duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none lg:w-[var(--panel-w)] ${
          open ? "p-4 sm:p-5" : "p-3 lg:overflow-hidden lg:px-0 lg:py-4"
        }`}
      >
        {open ? (
          <div key="open" className="panel-in lg:w-[calc(28rem-2.5rem)]">
            <SubscriptionForm onFold={() => setOpen(false)} />
          </div>
        ) : (
          // Folded: a slim strip on wide screens (reads bottom-to-top), a short bar on phones.
          <div key="closed" className="panel-in flex items-center justify-between gap-3 lg:h-full lg:flex-col lg:justify-start lg:gap-5">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Add a subscription"
              title="Add a subscription"
              className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-control bg-accent px-4 py-2.5 font-semibold text-accent-ink transition-opacity hover:opacity-90 lg:size-11 lg:justify-center lg:p-0"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <span className="lg:sr-only">Add a subscription</span>
            </button>
            <p className="text-sm text-muted lg:rotate-180 lg:[writing-mode:vertical-rl]">Add a subscription</p>
          </div>
        )}
      </section>

      <SubscriptionList subs={subs} veiled={veil > 0} />
    </div>
  );
}
