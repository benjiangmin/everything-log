"use client";

import { useActionState, useEffect, useRef } from "react";
import { useIsStuck } from "@/components/ui/useIsStuck";
import { addEntry, type FormState } from "@/app/budget/actions";
import type { Category } from "@/lib/budget";
import CategoryPicker from "./CategoryPicker";
import DateWheel from "@/components/ui/DateWheel";
import { localNow } from "@/lib/month";

const initial: FormState = { ok: false, message: null };

function todayKey() {
  const d = localNow();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default function AddEntryForm({
  categories,
  monthKey,
  isThisMonth,
}: {
  categories: Category[];
  monthKey: string;
  isThisMonth: boolean;
}) {
  const [state, action, pending] = useActionState(addEntry, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  // Clear amount + notes after a save, keep category and date for quick repeat entries.
  useEffect(() => {
    if (state.ok && formRef.current) {
      const form = formRef.current;
      (form.elements.namedItem("amount") as HTMLInputElement).value = "";
      (form.elements.namedItem("note") as HTMLInputElement).value = "";
      amountRef.current?.focus();
    }
  }, [state.savedAt, state.ok]);

  // Wide screens: the box sticks under the month bar. Its height is shared as --budget-add-h so the
  // Expenses heading can stick just below it; while stuck it gets the month bar's shadow.
  const [stickRef, stuck] = useIsStuck<HTMLDivElement>();
  useEffect(() => {
    const el = stickRef.current;
    if (!el) return;
    const root = document.documentElement;
    const wide = window.matchMedia("(min-width: 48rem)");
    const update = () => root.style.setProperty("--budget-add-h", wide.matches ? `${el.offsetHeight}px` : "0px");
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    wide.addEventListener("change", update);
    return () => {
      observer.disconnect();
      wide.removeEventListener("change", update);
      root.style.removeProperty("--budget-add-h");
    };
  }, [stickRef]);

  const defaultDate = isThisMonth ? todayKey() : `${monthKey}-01`;

  const field =
    "w-full rounded-control border border-line bg-paper px-3 py-2.5 text-ink placeholder:text-muted/70 focus:border-ink focus:outline-none";

  return (
    // The paper strip behind the box (-mx-4 px-4 pb-2) hides the list as it scrolls under.
    // z-[25]: above the Expenses heading, so the category and date pickers open over it.
    // data-stick-under: the month bar's own fade hides while this sits under it.
    <div
      ref={stickRef}
      data-stick-under
      className="relative z-[25] -mx-4 mt-8 bg-paper px-4 pb-2 md:sticky md:top-[var(--sticky-top,0px)]"
    >
    <section
      aria-labelledby="add-heading"
      className={`rounded-card bg-surface p-5 transition-shadow duration-200 sm:px-6 sm:py-5 ${stuck ? "md:shadow-lg md:shadow-ink/15" : ""}`}
    >
      {/* "Saved." / problems show on the right of the heading, so the row below never shifts. */}
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="add-heading" className="font-display text-xl font-semibold">
          Add an expense
        </h2>
        <p role="status" className={`text-sm ${state.ok ? "text-muted" : "text-danger"}`}>
          {state.ok ? "Saved." : state.message}
        </p>
      </div>

      {/* Phones: amount + notes, category + date, then Save. Wide screens: all on one line. */}
      <form ref={formRef} action={action} className="mt-3 flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="contents md:grid md:grid-cols-[7rem_minmax(0,1fr)_10rem_8.5rem] md:gap-3">
        {/* Amount + notes. The amount never shrinks below 7rem. */}
        <div className="grid grid-cols-[minmax(7rem,1fr)_4fr] gap-3 md:contents">
          <label>
            <span className="mb-1 block text-sm text-muted">Amount</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
              <input
                ref={amountRef}
                name="amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                className={`${field} num no-spin pl-7`}
              />
            </div>
          </label>

          <label>
            <span className="mb-1 block text-sm text-muted">Notes</span>
            <input name="note" type="text" maxLength={120} placeholder="Trader Joe's" className={field} />
          </label>
        </div>

        {/* Category + date, half and half */}
        <div className="grid grid-cols-2 gap-3 md:contents">
          <div>
            <span className="mb-1 block text-sm text-muted">Category</span>
            <CategoryPicker name="category_id" categories={categories} />
          </div>

          <div>
            <span className="mb-1 block text-sm text-muted">Date</span>
            <DateWheel key={defaultDate} name="spent_on" defaultValue={defaultDate} noYear />
          </div>
        </div>
        </div>

        {/* Save: just a +, the same height as the boxes beside it. */}
        <button
          type="submit"
          disabled={pending}
          aria-label="Save expense"
          title="Save expense"
          className="grid h-[2.875rem] w-full place-items-center rounded-control bg-accent text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60 md:w-[2.875rem]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={pending ? "animate-pulse" : ""}>
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </button>
      </form>
    </section>
    </div>
  );
}
