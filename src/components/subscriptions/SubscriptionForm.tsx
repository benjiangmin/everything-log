"use client";

import { useActionState, useEffect, useState } from "react";
import { addSubscription, updateSubscription, type FormState } from "@/app/subscriptions/actions";
import type { Subscription } from "@/lib/subscriptions";
import type { Cycle } from "@/lib/subscription-dates";
import OptionalDate from "@/components/games/OptionalDate";

const initial: FormState = { ok: false, message: null };
const field =
  "w-full rounded-control border border-line bg-paper px-3 py-2.5 text-ink placeholder:text-muted/70 focus:border-ink";

// The add box on the left (pass `sub` to edit one inside its card instead).
//   name [+ Link]
//   $ price | M / Y | next charge
//   (link, under a line, once + Link is clicked)
//   [ Add ]
export default function SubscriptionForm({
  sub,
  onDone,
  onFold,
}: {
  sub?: Subscription;
  onDone?: () => void;
  onFold?: () => void; // the add box: shows a ‹ to slide it away
}) {
  const editing = Boolean(sub);
  const [state, action, pending] = useActionState(editing ? updateSubscription : addSubscription, initial);
  const [cycle, setCycle] = useState<Cycle>(sub?.cycle ?? "monthly");
  const [showLink, setShowLink] = useState(Boolean(sub?.link));
  const [round, setRound] = useState(0); // bumps after adding, which empties the boxes

  const [seenSave, setSeenSave] = useState(state.savedAt);
  if (state.savedAt !== seenSave) {
    setSeenSave(state.savedAt);
    if (state.ok && !editing) {
      setRound((r) => r + 1);
      setCycle("monthly");
      setShowLink(false);
    }
  }
  useEffect(() => {
    if (state.ok && editing) onDone?.();
  }, [state.ok, state.savedAt, editing, onDone]);

  return (
    <form key={round} action={action} className="flex flex-col gap-3">
      {sub && <input type="hidden" name="id" value={sub.id} />}
      <input type="hidden" name="cycle" value={cycle} />

      {!editing && (
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Add a subscription</h2>
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
      )}

      {/* Name, with the dotted "+ Link" inside it on the right. */}
      <div className="relative">
        <input
          name="name"
          required
          maxLength={120}
          defaultValue={sub?.name ?? ""}
          placeholder="Spotify"
          aria-label="Name"
          autoFocus={editing}
          style={{ outline: "none" }}
          className={`${field} pr-24`}
        />
        {/* Centered up and down in the name box, whatever its height. */}
        <button
          type="button"
          onClick={() => setShowLink((v) => !v)}
          aria-expanded={showLink}
          className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-[9px] border px-2.5 py-1.5 text-xs leading-none font-semibold transition-colors ${
            showLink ? "border-accent/30 bg-accent/10 text-accent" : "border-dashed border-muted/50 text-muted hover:border-muted hover:text-ink"
          }`}
        >
          {showLink ? "− Link" : "+ Link"}
        </button>
      </div>

      {/* Price | M / Y | next charge, on one line. */}
      <div className="flex items-stretch gap-2">
        <div className="relative w-24 shrink-0">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
          <input
            name="price"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            required
            defaultValue={sub ? sub.price.toFixed(2) : ""}
            placeholder="0.00"
            aria-label="Price"
            style={{ outline: "none" }}
            className={`${field} num no-spin h-full pl-7`}
          />
        </div>
        <div role="radiogroup" aria-label="How often" className="flex shrink-0 rounded-control border border-line bg-paper p-1">
          {(["monthly", "yearly"] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={cycle === c}
              aria-label={c === "monthly" ? "Monthly" : "Yearly"}
              title={c === "monthly" ? "Monthly" : "Yearly"}
              onClick={() => setCycle(c)}
              className={`w-9 rounded-[8px] text-sm font-semibold transition-colors ${
                cycle === c ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"
              }`}
            >
              {c === "monthly" ? "M" : "Y"}
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 items-center">
          <OptionalDate key={round} name="next_charge" label="Billing date" defaultValue={sub?.next_charge ?? null} block />
        </div>
      </div>

      {/* The link (e.g. where to manage or cancel it), under a line. Folding it away doesn't
          remove a saved link; clear the box to remove it. */}
      {showLink && (
        <div className="border-t border-accent/20 pt-3">
          <input
            name="link"
            type="text"
            inputMode="url"
            maxLength={500}
            autoFocus={!sub?.link}
            defaultValue={sub?.link ?? ""}
            placeholder="spotify.com/account"
            aria-label="Link (optional)"
            style={{ outline: "none" }}
            className={field}
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="h-11 flex-1 rounded-control bg-accent px-5 font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Saving…" : editing ? "Save changes" : "Add"}
          </button>
          {editing && (
            <button type="button" onClick={onDone} className="rounded-control px-4 text-muted transition-colors hover:bg-paper hover:text-ink">
              Cancel
            </button>
          )}
        </div>
        {(state.message || (state.ok && !editing)) && (
          <p role="status" className={`text-sm ${state.ok ? "text-muted" : "text-danger"}`}>
            {state.ok && !editing ? "Added." : state.message}
          </p>
        )}
      </div>
    </form>
  );
}
