"use client";

import { useEffect, useState, useTransition } from "react";
import { inboxLetters, openLetter } from "@/app/letters/actions";
import type { Envelope, Letter } from "@/lib/letters";
import ReadingView from "./ReadingView";
import SealedEnvelope from "./SealedEnvelope";
import { longDate } from "./dates";

// The letters inbox (from the sidebar): slides in from the right. Arrived letters you haven't read,
// as sealed envelopes; click one to read it in the middle of the screen, then "Mark as read".
export default function LettersInboxPanel({ onClose, onRead }: { onClose: () => void; onRead: () => void }) {
  const [letters, setLetters] = useState<Envelope[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sealed, setSealed] = useState<Envelope | null>(null); // the envelope you're tapping open
  const [loaded, setLoaded] = useState<Letter | null>(null); // its words, fetched while you tap
  const [reading, setReading] = useState<Letter | null>(null);
  const [, start] = useTransition();

  useEffect(() => {
    let live = true;
    inboxLetters().then((res) => {
      if (!live) return;
      if (res.ok) setLetters(res.letters);
      else setError(res.message);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (reading || sealed) return; // Escape closes the letter / envelope first
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, reading, sealed]);

  // Show the sealed envelope right away, and fetch the words while you tap it open.
  function open(e: Envelope) {
    setSealed(e);
    setLoaded(null);
    start(async () => {
      const res = await openLetter(e.id);
      if (res.ok) setLoaded(res.letter);
      else {
        setSealed(null);
        setError(res.message);
      }
    });
  }

  const count = letters?.length ?? 0;

  return (
    <div className="fixed inset-0 z-[70]">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/30" />
      <aside aria-label="Inbox" className="panel-slide absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-paper shadow-2xl shadow-ink/30">
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="font-display text-xl font-semibold">Inbox</h2>
            <p className="text-sm text-muted">{letters ? (count ? `${count} new ${count === 1 ? "letter" : "letters"}` : "Nothing new") : error ? "" : "Checking…"}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-control text-muted transition-colors hover:bg-surface hover:text-ink">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-width:thin]">
          {error && <p className="rounded-card bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}
          {letters && count === 0 && (
            <div className="grid place-items-center gap-3 rounded-card border border-dashed border-line px-5 py-12 text-center text-muted">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 13h5l1.5 3h5L16 13h5" />
                <path d="M5.5 5h13L21 13v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5L5.5 5z" />
              </svg>
              No letters right now.
            </div>
          )}
          <ul className="space-y-2">
            {letters?.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => open(e)}
                  className="group flex w-full items-center gap-3.5 rounded-card bg-accent px-4 py-3.5 text-left text-accent-ink shadow-md shadow-ink/15 transition-transform hover:-translate-y-0.5 disabled:opacity-70"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="M3.5 6l8.5 7 8.5-7" />
                  </svg>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{e.subject}</span>
                    <span className="block text-xs opacity-70">
                      {e.written_on ? `From ${longDate(e.written_on)}` : "From the past"} · arrived {longDate(e.deliver_on)}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold opacity-80">Open</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {sealed && (
        <SealedEnvelope
          envelope={sealed}
          ready={loaded?.id === sealed.id}
          onClose={() => setSealed(null)}
          onOpened={() => {
            setReading(loaded);
            setSealed(null);
          }}
        />
      )}

      {reading && (
        <ReadingView
          letter={reading}
          dramatic
          onClose={() => setReading(null)}
          onRead={() => {
            setLetters((l) => l && l.filter((x) => x.id !== reading.id));
            setReading(null);
            onRead();
          }}
        />
      )}
    </div>
  );
}
