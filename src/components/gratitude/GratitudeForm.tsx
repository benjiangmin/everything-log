"use client";

import { useActionState, useEffect, useRef, type KeyboardEvent } from "react";
import { addGratitude, updateGratitude, type FormState } from "@/app/gratitude/actions";
import type { GratitudeEntry } from "@/lib/gratitude";
import DateWheel from "@/components/ui/DateWheel";
import { localNow } from "@/lib/month";

const initial: FormState = { ok: false, message: null };
const SLOTS = ["first", "second", "third"] as const;
const PLACEHOLDERS = ["My bed", "The goobest goobster in goobville", "A thousand bucks"];

// Browsers without CSS field-sizing (Firefox, for now): grow the box to fit its text by hand.
function fit(box: HTMLTextAreaElement) {
  if (typeof CSS !== "undefined" && CSS.supports("field-sizing", "content")) return;
  box.style.height = "auto";
  box.style.height = `${box.scrollHeight}px`;
}

function todayKey() {
  const d = localNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Used for both adding a new entry and editing one. Pass `entry` to edit.
export default function GratitudeForm({
  entry,
  defaultDate,
  onDone,
  onFold,
}: {
  entry?: GratitudeEntry;
  defaultDate?: string; // for new entries
  onDone?: () => void; // for edits: close the editor after saving or cancelling
  onFold?: () => void; // the add box: shows a ‹ to slide it away
}) {
  const editing = Boolean(entry);
  const [state, action, pending] = useActionState(editing ? updateGratitude : addGratitude, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const firstRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!state.ok) return;
    if (editing) {
      onDone?.();
    } else if (formRef.current) {
      // New entry saved: clear the three lines, keep the date, start again at #1.
      for (const slot of SLOTS) {
        const box = formRef.current.elements.namedItem(slot) as HTMLTextAreaElement;
        box.value = "";
        fit(box);
      }
      firstRef.current?.focus();
    }
  }, [state.ok, state.savedAt, editing, onDone]);

  // Editing an old entry: size the lines to the text already in them.
  useEffect(() => {
    for (const slot of SLOTS) {
      const box = formRef.current?.elements.namedItem(slot);
      if (box instanceof HTMLTextAreaElement) fit(box);
    }
  }, []);

  // Enter moves to the next line (and saves from the last one) instead of adding a line break.
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>, i: number) {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    const next = SLOTS[i + 1] && (formRef.current?.elements.namedItem(SLOTS[i + 1]) as HTMLTextAreaElement | null);
    if (next) next.focus();
    else formRef.current?.requestSubmit();
  }

  const date = entry?.entry_date ?? defaultDate ?? todayKey();

  return (
    <form ref={formRef} action={action} className="flex flex-col">
      {entry && <input type="hidden" name="id" value={entry.id} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">{editing ? "Edit entry" : "Three good things"}</h2>
        <div className="flex items-center gap-1">
          {/* The add box shows "Nov 1" (the year's still in the wheels) so it fits beside the ‹. */}
          <div className={onFold ? "w-32" : "w-44"}>
            <DateWheel key={date} name="entry_date" defaultValue={date} noYear={Boolean(onFold)} />
          </div>
          {onFold && (
            <button
              type="button"
              onClick={onFold}
              aria-label="Fold the add box"
              title="Fold"
              className="-mr-2 grid size-9 place-items-center rounded-control text-muted transition-colors hover:bg-paper hover:text-ink"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Journal lines: a big cinnamon numeral, then an underlined line to write on. */}
      <ol className="mt-2">
        {SLOTS.map((slot, i) => (
          <li key={slot} className="flex items-baseline gap-3">
            <span aria-hidden="true" className="num w-6 shrink-0 font-display text-xl font-semibold text-accent">
              {i + 1}
            </span>
            {/* Grows downward as you type (long ones wrap onto more lines instead of scrolling sideways). */}
            <textarea
              ref={i === 0 ? firstRef : undefined}
              name={slot}
              rows={1}
              required
              maxLength={200}
              autoFocus={editing && i === 0}
              defaultValue={entry?.[slot] ?? ""}
              placeholder={PLACEHOLDERS[i]}
              aria-label={`Thing ${i + 1}`}
              onKeyDown={(e) => onKeyDown(e, i)}
              onInput={(e) => fit(e.currentTarget)}
              className="field-sizing-content block w-full resize-none overflow-hidden border-b-2 border-line bg-transparent py-1.5 text-ink placeholder:text-muted/70 focus:border-ink"
              // No focus box: the underline turning dark shows which line you're on.
              style={{ outline: "none" }}
            />
          </li>
        ))}
      </ol>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-control bg-accent px-5 py-2 font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Saving…" : editing ? "Save changes" : "Save entry"}
        </button>
        {editing && (
          <button
            type="button"
            onClick={onDone}
            className="rounded-control px-4 py-2.5 text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            Cancel
          </button>
        )}
        <p role="status" className={`text-sm ${state.ok ? "text-muted" : "text-danger"}`}>
          {state.ok && !editing ? "Saved." : state.message}
        </p>
      </div>
    </form>
  );
}
