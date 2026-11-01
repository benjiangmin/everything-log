"use client";

import { useState, useTransition } from "react";
import { addFocusArea } from "@/app/focus/actions";

const field =
  "w-full rounded-control border border-line bg-paper px-3 py-2.5 text-ink placeholder:text-muted/70 focus:border-ink";

// Under the focus areas: a dashed "+ Add focus area" box. Click it to open a small form in its
// place (name, optional goal); Add or Cancel folds it back.
export default function AddFocusArea({ recordId }: { recordId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [showGoal, setShowGoal] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function close() {
    setOpen(false);
    setName("");
    setGoal("");
    setShowGoal(false);
    setMessage(null);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-card border-2 border-dashed border-line px-4 py-4 font-semibold text-muted transition-colors hover:border-muted hover:text-ink"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        Add focus area
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await addFocusArea(recordId, name, goal);
          if (res.ok) close();
          else setMessage(res.message);
        });
      }}
      className="flex flex-col gap-2 rounded-card border-2 border-dashed border-muted/50 p-3"
    >
      <div className="relative flex">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={100}
          placeholder="A focus area"
          aria-label="New focus area"
          style={{ outline: "none" }}
          className={`${field} pr-20`}
          onKeyDown={(e) => e.key === "Escape" && close()}
        />
        <button
          type="button"
          onClick={() => setShowGoal((v) => !v)}
          aria-expanded={showGoal}
          className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded-[9px] px-2.5 py-1.5 text-xs font-semibold transition-colors ${
            showGoal ? "bg-accent/15 text-accent" : "bg-surface text-muted hover:text-ink"
          }`}
        >
          {showGoal ? "− Goal" : "+ Goal"}
        </button>
      </div>
      {showGoal && (
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="An optional concrete goal"
          aria-label="Goal (optional)"
          style={{ outline: "none" }}
          className={`${field} resize-y text-sm`}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-control bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add"}
        </button>
        <button type="button" onClick={close} className="rounded-control px-3 py-2 text-sm text-muted transition-colors hover:bg-surface hover:text-ink">
          Cancel
        </button>
        {message && <p className="text-sm text-danger">{message}</p>}
      </div>
    </form>
  );
}
