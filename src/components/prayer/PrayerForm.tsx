"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addPrayer, updatePrayer, type FormState } from "@/app/prayer/actions";
import type { Prayer } from "@/lib/prayers";
import { localNow } from "@/lib/month";
import RichText from "@/components/dreams/RichText";
import OptionalDate from "@/components/games/OptionalDate";

const initial: FormState = { ok: false, message: null };
const field =
  "w-full rounded-control border border-line bg-paper px-3 py-2.5 text-ink placeholder:text-muted/70 focus:border-ink";

function todayKey() {
  const d = localNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The writing box on the left (pass `prayer` to edit one inside its card instead).
// Title (optional) | date (optional, today by default) | the prayer.
export default function PrayerForm({ prayer, onDone }: { prayer?: Prayer; onDone?: () => void }) {
  const editing = Boolean(prayer);
  const [state, action, pending] = useActionState(editing ? updatePrayer : addPrayer, initial);
  const [body, setBody] = useState(prayer?.body ?? "");
  const [round, setRound] = useState(0); // bumps after adding, which resets the boxes
  const titleRef = useRef<HTMLInputElement>(null);

  // Added one: start a fresh, empty box.
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
      {prayer && <input type="hidden" name="id" value={prayer.id} />}
      <input type="hidden" name="body" value={body} />
      {!editing && <h2 className="font-display text-lg font-semibold">Dear God…</h2>}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={titleRef}
          name="title"
          maxLength={200}
          defaultValue={prayer?.title ?? ""}
          placeholder="Title (optional)"
          aria-label="Title (optional)"
          style={{ outline: "none" }}
          className={`${field} min-w-0 flex-1 basis-48`}
        />
        <OptionalDate name="prayed_on" label="Date" defaultValue={editing ? (prayer!.prayed_on ?? null) : todayKey()} />
      </div>
      <RichText initial={body} onChange={setBody} onFiles={() => {}} placeholder="The prayer…" label="The prayer" autoFocus={editing} />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-control bg-accent px-5 py-2.5 font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Saving…" : editing ? "Save changes" : "Add prayer"}
        </button>
        {editing && (
          <button type="button" onClick={onDone} className="rounded-control px-4 py-2.5 text-muted transition-colors hover:bg-paper hover:text-ink">
            Cancel
          </button>
        )}
        <p role="status" className={`text-sm ${state.ok ? "text-muted" : "text-danger"}`}>
          {state.ok && !editing ? "Amen. Added." : state.message}
        </p>
      </div>
    </form>
  );
}
