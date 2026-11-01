"use client";

import { useActionState, useEffect, useRef } from "react";
import { addLearned, updateLearned, type FormState } from "@/app/learned/actions";
import type { LearnedEntry } from "@/lib/learned";
import DateWheel from "@/components/ui/DateWheel";
import { localNow } from "@/lib/month";

const initial: FormState = { ok: false, message: null };
const field =
  "w-full rounded-control border border-line bg-paper px-3 py-2.5 text-ink placeholder:text-muted/70 focus:border-ink";

function todayKey() {
  const d = localNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Adding (the box on the left) and editing (inside an entry). Pass `entry` to edit.
export default function LearnedForm({
  entry,
  defaultDate,
  onDone,
  onFold,
}: {
  entry?: LearnedEntry;
  defaultDate?: string;
  onDone?: () => void;
  onFold?: () => void; // the add box: shows a ‹ to slide it away
}) {
  const editing = Boolean(entry);
  const [state, action, pending] = useActionState(editing ? updateLearned : addLearned, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const factRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!state.ok) return;
    if (editing) return onDone?.();
    // Added: clear the words, keep the date, ready for the next one.
    for (const name of ["fact", "source"]) {
      const el = formRef.current?.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null;
      if (el) el.value = "";
    }
    factRef.current?.focus();
  }, [state.ok, state.savedAt, editing, onDone]);

  const date = entry?.entry_date ?? defaultDate ?? todayKey();

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3">
      {entry && <input type="hidden" name="id" value={entry.id} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!editing && <h2 className="font-display text-lg font-semibold">Something new</h2>}
        <div className="flex items-center gap-1">
          <div className={onFold ? "w-40" : "w-44"}>
            <DateWheel key={date} name="entry_date" defaultValue={date} />
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
      <textarea
        ref={factRef}
        name="fact"
        required
        rows={editing ? 3 : 5}
        maxLength={2000}
        autoFocus={editing}
        defaultValue={entry?.fact ?? ""}
        placeholder="What did you learn today?"
        aria-label="What you learned"
        style={{ outline: "none" }}
        className={`${field} resize-y leading-relaxed`}
        // Enter adds it (Shift+Enter for a new line).
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
      />
      {/* "From" sits in its own tinted tab on the left, split from the typing area by a line. */}
      <label className="group flex items-stretch overflow-hidden rounded-control border border-accent/40 bg-paper focus-within:border-ink">
        <span className="grid shrink-0 place-items-center border-r border-accent/40 bg-line px-3 text-sm font-semibold text-ink/70 group-focus-within:border-ink">
          From
        </span>
        <input
          name="source"
          maxLength={200}
          defaultValue={entry?.source ?? ""}
          placeholder="(optional)"
          aria-label="Where you learned it (optional)"
          style={{ outline: "none" }}
          className="w-full min-w-0 bg-transparent px-3 py-2.5 text-ink placeholder:text-muted/70"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-control bg-accent px-5 py-2.5 font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Saving…" : editing ? "Save changes" : "Add"}
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
          {state.ok && !editing ? "Added." : state.message}
        </p>
      </div>
    </form>
  );
}
