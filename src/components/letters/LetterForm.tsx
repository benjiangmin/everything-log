"use client";

import { useActionState, useEffect, useState } from "react";
import { addLetter, updateLetter, type FormState } from "@/app/letters/actions";
import type { Letter } from "@/lib/letters";
import RichText from "@/components/dreams/RichText";
import DateWheel from "@/components/ui/DateWheel";
import { longDate } from "./dates";

const initial: FormState = { ok: false, message: null };
const field =
  "w-full rounded-control border border-line bg-paper px-3 py-2.5 text-ink placeholder:text-muted/70 focus:border-ink";

// Write a letter (or, with `letter`, edit one). Subject | written (always today) · arrives on | the letter.
export default function LetterForm({
  today,
  letter,
  onDone,
  onFold,
}: {
  today: string;
  letter?: Letter;
  onDone?: () => void;
  onFold?: () => void; // the writing box: shows a ‹ to slide it away
}) {
  const editing = Boolean(letter);
  const [state, action, pending] = useActionState(editing ? updateLetter : addLetter, initial);
  const [body, setBody] = useState(letter?.body ?? "");
  const [round, setRound] = useState(0); // bumps after sending, which empties the form

  const [seenSave, setSeenSave] = useState(state.savedAt);
  if (state.savedAt !== seenSave) {
    setSeenSave(state.savedAt);
    if (state.ok && !editing) {
      setBody("");
      setRound((r) => r + 1);
    }
  }
  useEffect(() => {
    if (state.ok && editing) onDone?.();
  }, [state.ok, state.savedAt, editing, onDone]);

  return (
    <form key={round} action={action} className="flex flex-col gap-3">
      {letter && <input type="hidden" name="id" value={letter.id} />}
      <input type="hidden" name="body" value={body} />
      {!editing && (
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Dear future me,</h2>
          {onFold && (
            <button
              type="button"
              onClick={onFold}
              aria-label="Fold the writing box"
              title="Fold"
              className="-mr-2 grid size-9 place-items-center rounded-control text-muted transition-colors hover:bg-paper hover:text-ink"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      )}

      <input
        name="subject"
        required
        maxLength={200}
        defaultValue={letter?.subject ?? ""}
        placeholder="Subject, e.g. For the beginning of 2028"
        aria-label="Subject"
        style={{ outline: "none" }}
        className={field}
      />

      <div className="grid grid-cols-2 gap-3">
        {/* Written: always the day you write it (an edit keeps its original date). */}
        <div>
          <span className="mb-1 block text-sm text-muted">Written</span>
          <p className="num flex h-[2.875rem] items-center rounded-control border border-line/70 px-3 text-ink">
            {letter ? (letter.written_on ? longDate(letter.written_on) : "—") : longDate(today)}
          </p>
        </div>
        <label>
          <span className="mb-1 block text-sm text-muted">Arrives</span>
          <DateWheel name="deliver_on" defaultValue={letter?.deliver_on ?? today} years={[-5, 30]} />
        </label>
      </div>

      <RichText initial={body} onChange={setBody} onFiles={() => {}} placeholder="Dear Benj…" label="The letter" autoFocus={editing} />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-control bg-accent px-5 py-2.5 font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Sending…" : editing ? "Save changes" : "Seal & send"}
        </button>
        {editing && (
          <button type="button" onClick={onDone} className="rounded-control px-4 py-2.5 text-muted transition-colors hover:bg-paper hover:text-ink">
            Cancel
          </button>
        )}
        <p role="status" className={`text-sm ${state.ok ? "text-muted" : "text-danger"}`}>
          {state.ok && !editing && state.deliverOn
            ? state.deliverOn > today
              ? `Sealed. See you on ${longDate(state.deliverOn)}.`
              : "Sent. It's already waiting for you."
            : state.message}
        </p>
      </div>
    </form>
  );
}
