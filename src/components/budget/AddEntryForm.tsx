"use client";

import { useActionState, useEffect, useRef } from "react";
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

  const defaultDate = isThisMonth ? todayKey() : `${monthKey}-01`;

  const field =
    "w-full rounded-control border border-line bg-paper px-3 py-2.5 text-ink placeholder:text-muted/70 focus:border-ink focus:outline-none";

  return (
    <section aria-labelledby="add-heading" className="rounded-card bg-surface p-5 sm:p-6">
      <h2 id="add-heading" className="font-display text-xl font-semibold">
        Add an expense
      </h2>

      <form ref={formRef} action={action} className="mt-4 flex flex-col gap-3">
        {/* Row 1: amount (≈20%) + notes (≈80%). The amount never shrinks below 7rem. */}
        <div className="grid grid-cols-[minmax(7rem,1fr)_4fr] gap-3">
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

        {/* Row 2: category + date, half and half */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="mb-1 block text-sm text-muted">Category</span>
            <CategoryPicker name="category_id" categories={categories} />
          </div>

          <div>
            <span className="mb-1 block text-sm text-muted">Date</span>
            <DateWheel key={defaultDate} name="spent_on" defaultValue={defaultDate} />
          </div>
        </div>

        <div className="mt-1 flex items-center gap-4">
          <button
            type="submit"
            disabled={pending}
            className="rounded-control bg-accent px-6 py-2.5 font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save expense"}
          </button>
          <p role="status" className={`text-sm ${state.ok ? "text-muted" : "text-danger"}`}>
            {state.ok ? "Saved." : state.message}
          </p>
        </div>
      </form>
    </section>
  );
}
