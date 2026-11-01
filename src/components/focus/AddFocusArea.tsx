"use client";

import { useRef, useState, useTransition } from "react";
import { addFocusArea } from "@/app/focus/actions";

const field =
  "w-full rounded-control border border-line bg-paper px-3 py-2.5 text-ink placeholder:text-muted/70 focus:border-ink";

// One line: the focus area's name [+ Goal] | +. The goal opens underneath.
export default function AddFocusArea({ recordId }: { recordId: string }) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [showGoal, setShowGoal] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await addFocusArea(recordId, name, goal);
          if (!res.ok) return setMessage(res.message);
          setName("");
          setGoal("");
          setShowGoal(false);
          setMessage(null);
          nameRef.current?.focus();
        });
      }}
      className="flex flex-col"
    >
      <div className="flex gap-2">
        <div className="relative flex min-w-0 flex-1">
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
            placeholder="A focus area (guitar, code, cooking…)"
            aria-label="New focus area"
            style={{ outline: "none" }}
            className={`${field} pr-24`}
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
        <button
          type="submit"
          disabled={pending}
          aria-label="Add focus area"
          title="Add focus area"
          className="grid h-11 w-14 shrink-0 place-items-center rounded-control bg-accent text-accent-ink shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? (
            <span className="size-5 animate-spin rounded-full border-2 border-accent-ink/30 border-t-accent-ink" aria-hidden="true" />
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>
      {showGoal && (
        <div className="mt-3 border-t border-accent/20 pt-3">
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="The goal (optional): what you're going for this stretch"
            aria-label="Goal (optional)"
            style={{ outline: "none" }}
            className={`${field} resize-y`}
          />
        </div>
      )}
      {message && (
        <p role="status" className="mt-2 text-sm text-danger">
          {message}
        </p>
      )}
    </form>
  );
}
