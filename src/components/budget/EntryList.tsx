"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { deleteEntry, updateEntry, type FormState } from "@/app/budget/actions";
import type { Category, Entry } from "@/lib/budget";
import { formatMoney } from "@/lib/month";
import CategoryPicker from "./CategoryPicker";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import DateWheel from "@/components/ui/DateWheel";
import { useIsStuck } from "@/components/ui/useIsStuck";

// "2026-10-22" → { day: "22", weekday: "Thu" }
function dayParts(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short" });
  return { day: String(d), weekday };
}

export default function EntryList({
  entries,
  categories,
  focusId,
  monthName,
}: {
  entries: Entry[];
  categories: Category[];
  focusId?: string; // an expense to scroll to and flash (from a search result)
  monthName: string; // e.g. "October", for the empty message
}) {
  const [headingRef, headingStuck] = useIsStuck<HTMLDivElement>(); // for the fade under the heading
  const byId = new Map(categories.map((c) => [c.id, c]));
  const days: { date: string; items: Entry[] }[] = [];
  for (const e of entries) {
    const last = days[days.length - 1];
    if (last && last.date === e.spent_on) last.items.push(e);
    else days.push({ date: e.spent_on, items: [e] });
  }

  return (
    // The bordered panel, in two stacked parts that share the same side borders:
    //  1. the heading, which carries the rounded top border and sticks under the month bar
    //  2. the list, with side borders only, running to the bottom of the page
    // Border thickness: change every border-[1.5px] / border-x-[1.5px] below.
    <div className="mt-8 flex flex-1 flex-col">
      {/* Sticks just under the month bar while you scroll (--sticky-top is the bar's height,
          measured by StickyTop). Its own rounded top border means the top line stays visible
          while it's stuck. The paper background hides rows passing under it. */}
      {/* The square paper backing hides the list's side lines behind the heading's rounded corners. */}
      {/* data-stick-under tells the month bar's fade to hide once this is stuck right under it. */}
      <div
        ref={headingRef}
        data-stick-under
        className="sticky z-20 bg-paper"
        // Under the month bar and the add box (--budget-add-h is the add box's height on wide screens).
        style={{ top: "calc(var(--sticky-top, 0px) + var(--budget-add-h, 0px))" }}
      >
        <h2
          id="entries-heading"
          className="rounded-t-card border-[1.5px] border-b-0 border-ink px-4 pb-2 pt-5 font-display text-xl font-semibold sm:px-6"
        >
          Expenses
        </h2>
        {/* Fade under the heading while it's stuck and the list scrolls beneath it.
            Inset 1.5px on each side so it stays inside the border. Height: h-6. */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-[1.5px] top-full h-6 bg-gradient-to-b from-paper to-transparent transition-opacity duration-200 ${
            headingStuck ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>

      {/* overflow-clip trims the mascots at the border.
          min-h-[52vh]: the box is never shorter than Gholdengo (50vh tall, 5vh hidden below), so his
          head never gets cut off. If you change .mascot's height in globals.css, update this too. */}
      <section
        aria-labelledby="entries-heading"
        className="relative flex min-h-[52vh] flex-1 flex-col overflow-clip border-x-[1.5px] border-ink px-4 sm:px-6"
      >
      <div className="relative z-10">

        {entries.length === 0 ? (
          <p className="mt-2 rounded-card border border-dashed border-line px-5 py-6 text-muted">
            Nothing logged for {monthName} yet.
          </p>
        ) : (
          /* One block per day: the date sits in a left column, that day's expenses to the right. */
          <ol className="mt-1 border-b border-line pb-6">
            {days.map((day) => {
              const { day: d, weekday } = dayParts(day.date);
              return (
                <li key={day.date} className="flex gap-4 border-t border-line py-2">
                  <div className="w-10 shrink-0 pt-1.5 text-center">
                    <div className="num font-display text-xl font-semibold leading-none">{d}</div>
                    <div className="mt-1 text-xs text-muted">{weekday}</div>
                  </div>
                  <ul className="min-w-0 flex-1">
                    {day.items.map((e) => (
                      <EntryRow
                        key={e.id}
                        entry={e}
                        category={byId.get(e.category_id)}
                        categories={categories}
                        focused={e.id === focusId}
                      />
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* Mascot layer. mt-auto pushes it to the bottom of the panel, so the mascots ride at the end
          of the list. The panel always reaches at least the bottom of the screen (flex-1 inside a
          full-height page), so on short lists they sit at the bottom of the screen instead.
          It has no height, so the mascots hang upward from it, behind the list (z-0 vs z-10).
          Tweak size/position/fade in the .mascot rules in globals.css. */}
      <div aria-hidden="true" className="pointer-events-none relative z-0 mt-auto h-0">
        {/* eslint-disable-next-line @next/next/no-img-element -- decorative */}
        <img src="/gimmighoul.png" alt="" className="mascot mascot-left" />
        {/* eslint-disable-next-line @next/next/no-img-element -- decorative */}
        <img src="/gholdengo.png" alt="" className="mascot" />
      </div>
      </section>
    </div>
  );
}

function EntryRow({
  entry,
  category,
  categories,
  focused,
}: {
  entry: Entry;
  category?: Category;
  categories: Category[];
  focused?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const confirm = useConfirm();
  const rowRef = useRef<HTMLLIElement>(null);

  // Arrived here from a search result: bring this row into view.
  useEffect(() => {
    if (focused) rowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focused]);

  if (editing) {
    return <EditRow entry={entry} categories={categories} onDone={() => setEditing(false)} />;
  }

  async function remove() {
    const ok = await confirm({
      title: "Delete this expense?",
      body: `${formatMoney(entry.amount)}${entry.note ? ` · ${entry.note}` : ""} will be removed for good.`,
      confirmLabel: "Delete",
    });
    if (ok) startTransition(() => deleteEntry(entry.id));
  }

  return (
    <li
      ref={rowRef}
      className={`group -mx-2 flex items-center gap-3 rounded-control px-2 py-0.5 ${pending ? "opacity-40" : ""}`}
    >
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: category?.color ?? "var(--muted)" }}
        aria-hidden="true"
      />
      {/* Solid box behind the note + price so the mascots don't show through.
          Color: bg-surface. Rounding: rounded-[8px]. Inner spacing: px-3 py-2.5. */}
      <div
        className={`flex min-w-0 flex-1 items-center gap-3 rounded-[8px] bg-surface px-3 py-2.5 ${
          focused ? "flash" : "" /* jumped here from search: the box flashes caramel */
        }`}
      >
        <p className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="truncate text-black">{entry.note || category?.name || "Expense"}</span>        {entry.note && <span className="shrink-0 text-sm text-muted">{category?.name}</span>}
        </p>
        <span className="num font-medium">{formatMoney(entry.amount)}</span>
      </div>
      <div className="flex">
        <button
          type="button"
          disabled={pending}
          onClick={() => setEditing(true)}
          aria-label={`Edit ${formatMoney(entry.amount)} ${category?.name ?? ""} expense`}
          className="grid size-7 place-items-center rounded-control text-muted opacity-50 transition hover:bg-surface hover:text-ink group-hover:opacity-100 group-hover:text-black"
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
          aria-label={`Delete ${formatMoney(entry.amount)} ${category?.name ?? ""} expense`}
          className="grid size-7 place-items-center rounded-control text-muted opacity-50 transition hover:bg-surface hover:text-danger! group-hover:opacity-100 group-hover:text-black"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </li>
  );
}

// Inline edit form that replaces a row while you're editing it.
function EditRow({
  entry,
  categories,
  onDone,
}: {
  entry: Entry;
  categories: Category[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateEntry, {
    ok: false,
    message: null,
  });

  // Close the editor once the save goes through.
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, state.savedAt, onDone]);

  const field =
    "w-full rounded-control border border-line bg-paper px-3 py-2.5 text-ink placeholder:text-muted/70 focus:border-ink focus:outline-none";

  return (
    <li className="py-2">
      <form action={action} className="flex flex-col gap-3 rounded-card bg-surface p-4">
        <input type="hidden" name="id" value={entry.id} />

        {/* Row 1: amount (≈20%) + notes (≈80%) */}
        <div className="grid grid-cols-[minmax(7rem,1fr)_4fr] gap-3">
          <label>
            <span className="mb-1 block text-sm text-muted">Amount</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
              <input
                name="amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                required
                autoFocus
                defaultValue={entry.amount.toFixed(2)}
                className={`${field} num no-spin pl-7`}
              />
            </div>
          </label>
          <label>
            <span className="mb-1 block text-sm text-muted">Notes</span>
            <input
              name="note"
              type="text"
              maxLength={120}
              defaultValue={entry.note ?? ""}
              placeholder="Trader Joe's"
              className={field}
            />
          </label>
        </div>

        {/* Row 2: category + date */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="mb-1 block text-sm text-muted">Category</span>
            <CategoryPicker name="category_id" categories={categories} defaultValue={entry.category_id} />
          </div>
          <div>
            <span className="mb-1 block text-sm text-muted">Date</span>
            <DateWheel name="spent_on" defaultValue={entry.spent_on} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-control bg-accent px-5 py-2 font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="rounded-control px-4 py-2 text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            Cancel
          </button>
          {state.message && (
            <p role="status" className="text-sm text-danger">
              {state.message}
            </p>
          )}
        </div>
      </form>
    </li>
  );
}
