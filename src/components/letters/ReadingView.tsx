"use client";

import { useEffect, useState, useTransition } from "react";
import { markRead } from "@/app/letters/actions";
import type { Letter } from "@/lib/letters";
import { longDate } from "./dates";

// A letter, opened: a sheet of paper in the middle of the screen. Unread ones get "Mark as read".
export default function ReadingView({ letter, onClose, onRead }: { letter: Letter; onClose: () => void; onRead?: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/40" />
      <article className="panel-pop relative flex max-h-[85dvh] w-full max-w-2xl flex-col rounded-card bg-paper shadow-2xl shadow-ink/30">
        <header className="flex items-start gap-3 border-b border-line px-6 pb-4 pt-5">
          <div className="min-w-0 flex-1">
            <h2 className="break-words font-display text-2xl font-semibold leading-tight">{letter.subject}</h2>
            <p className="mt-1 text-sm text-muted">
              {letter.written_on ? `Written ${longDate(letter.written_on)} · ` : ""}arrived {longDate(letter.deliver_on)}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-control text-muted hover:bg-surface hover:text-ink">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="dream-text min-h-0 flex-1 overflow-y-auto px-6 py-5 leading-relaxed text-ink" dangerouslySetInnerHTML={{ __html: letter.body }} />
        {onRead && (
          <footer className="flex items-center justify-end gap-3 border-t border-line px-6 py-3">
            {error && <p className="text-sm text-danger">{error}</p>}
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await markRead(letter.id);
                  if (res.ok) onRead();
                  else setError(res.message ?? "Something went wrong.");
                })
              }
              className="rounded-control bg-accent px-5 py-2 font-semibold text-accent-ink hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "…" : "Mark as read"}
            </button>
          </footer>
        )}
      </article>
    </div>
  );
}
