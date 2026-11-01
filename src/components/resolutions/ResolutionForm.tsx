"use client";

import { useActionState, useEffect, useRef } from "react";
import { addResolution, type FormState } from "@/app/resolutions/actions";

const initial: FormState = { ok: false, message: null };

// One line: the resolution, then +. Adds it to the bottom of the year's list.
export default function ResolutionForm({ year }: { year: number }) {
  const [state, action, pending] = useActionState(addResolution, initial);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!state.ok || !inputRef.current) return;
    inputRef.current.value = "";
    inputRef.current.focus();
  }, [state.ok, state.savedAt]);

  return (
    <form action={action} className="flex flex-col">
      <input type="hidden" name="year" value={year} />
      <div className="flex gap-2">
        <input
          ref={inputRef}
          name="title"
          required
          maxLength={300}
          placeholder={`A resolution for ${year}`}
          aria-label="New resolution"
          style={{ outline: "none" }}
          className="w-full min-w-0 flex-1 rounded-control border border-line bg-paper px-3 py-2.5 text-ink placeholder:text-muted/70 focus:border-ink"
        />
        <button
          type="submit"
          disabled={pending}
          aria-label="Add resolution"
          title="Add resolution"
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
      {state.message && (
        <p role="status" className="mt-2 text-sm text-danger">
          {state.message}
        </p>
      )}
    </form>
  );
}
