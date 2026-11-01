"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addCompliment, updateCompliment, type FormState } from "@/app/compliments/actions";
import type { Compliment } from "@/lib/compliments";
import DateWheel from "@/components/ui/DateWheel";
import { localNow } from "@/lib/month";

const initial: FormState = { ok: false, message: null };

function todayKey() {
  const d = localNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const field =
  "w-full rounded-control border border-line bg-paper px-3 py-2.5 text-ink placeholder:text-muted/70 focus:border-ink";

// The add box (top of the page), also used to edit one inside its card (pass `item`):
//
//   ┌────────┬──────────────────────────────┬─────┐
//   │ Oct 29 │ Who                          │  +  │
//   │  [?📅] │ What they said               │     │
//   │        │                              │+Note│
//   ├────────┴──────────────────────────────┴─────┤
//   │ Note (only after "+ Note")                  │
//   └─────────────────────────────────────────────┘
//
// The calendar-? button under the date = "I forgot the exact date": the box shows "?", and the
// date you leave in it just decides where the compliment sits in the list.
export default function ComplimentForm({ item, onDone }: { item?: Compliment; onDone?: () => void }) {
  const editing = Boolean(item);
  const [state, action, pending] = useActionState(editing ? updateCompliment : addCompliment, initial);
  const [more, setMore] = useState(Boolean(item?.note));
  const [forgot, setForgot] = useState(item?.date_known === false);
  const formRef = useRef<HTMLFormElement>(null);
  const personRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!state.ok) return;
    if (editing) return onDone?.();
    // Added: clear the words, keep the date, ready for the next one.
    const form = formRef.current;
    if (!form) return;
    for (const name of ["person", "compliment", "note"]) {
      const el = form.elements.namedItem(name) as HTMLInputElement | null;
      if (el) el.value = "";
    }
    setMore(false);
    setForgot(false);
    personRef.current?.focus();
  }, [state.ok, state.savedAt, editing, onDone]);

  const date = item?.said_on ?? todayKey();

  return (
    <form ref={formRef} action={action} className="flex flex-col">
      {item && <input type="hidden" name="id" value={item.id} />}
      {forgot && <input type="hidden" name="date_forgotten" value="on" />}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        {/* Left: the date (no year in the box) and the "forgot the date" toggle under it. Width: sm:w-28. */}
        <div className="flex shrink-0 items-center gap-2 sm:w-28 sm:flex-col sm:items-stretch sm:justify-center sm:border-r sm:border-accent/20 sm:pr-3">
          <div className="w-28 sm:w-auto">
            <DateWheel key={date} name="said_on" defaultValue={date} noYear display={forgot ? "?" : undefined} />
          </div>
          <button
            type="button"
            onClick={() => setForgot((f) => !f)}
            aria-pressed={forgot}
            title={forgot ? "Date forgotten (click to undo)" : "I forgot the exact date"}
            aria-label="I forgot the exact date"
            className={`grid h-9 w-11 shrink-0 place-items-center rounded-control sm:w-full transition-colors ${
              forgot ? "bg-accent/15 text-accent ring-1 ring-accent/50" : "border border-dashed border-muted/50 text-muted hover:border-muted hover:text-ink"
            }`}
          >
            {/* A calendar with a question mark. */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
              <path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M10.2 13.3a1.9 1.9 0 1 1 2.6 1.7c-.5.2-.8.6-.8 1.1v.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <circle cx="12" cy="18.4" r=".9" fill="currentColor" />
            </svg>
          </button>
        </div>

        {/* Middle: who, then what they said. */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            ref={personRef}
            name="person"
            required
            maxLength={120}
            defaultValue={item?.person}
            placeholder="Who"
            aria-label="Who said it"
            style={{ outline: "none" }}
            className={field}
          />
          <input
            name="compliment"
            required
            maxLength={1000}
            defaultValue={item?.compliment}
            placeholder="What they said"
            aria-label="The compliment"
            style={{ outline: "none" }}
            className={field}
          />
        </div>

        {/* Right: the big + (or Save), with the smaller "+ Note" under it. Width: sm:w-16. */}
        <div className="flex shrink-0 flex-col gap-1.5 sm:w-16">
          <button
            type="submit"
            disabled={pending}
            aria-label={editing ? "Save" : "Add compliment"}
            title={editing ? "Save" : "Add compliment"}
            className="grid h-11 place-items-center rounded-control bg-accent text-accent-ink shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60 sm:h-auto sm:flex-1"
          >
            {pending ? (
              <span className="size-5 animate-spin rounded-full border-2 border-accent-ink/30 border-t-accent-ink" aria-hidden="true" />
            ) : editing ? (
              <span className="text-sm font-semibold">Save</span>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={() => setMore((m) => !m)}
            aria-expanded={more}
            className="rounded-control px-1 py-1 text-xs font-semibold text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            {more ? "− Note" : "+ Note"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={onDone}
              className="rounded-control px-1 py-1 text-xs text-muted transition-colors hover:bg-paper hover:text-ink"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* The note: under a thin line, on its own row. Kept in the form even when hidden,
          so editing doesn't lose it. */}
      <div className={`mt-3 border-t border-accent/20 pt-3 ${more ? "" : "hidden"}`}>
        <input
          name="note"
          maxLength={1000}
          defaultValue={item?.note ?? ""}
          placeholder="A note about it (optional)"
          aria-label="Note"
          style={{ outline: "none" }}
          className={field}
        />
      </div>

      {state.message && (
        <p role="status" className="mt-2 text-sm text-danger">
          {state.message}
        </p>
      )}
    </form>
  );
}
