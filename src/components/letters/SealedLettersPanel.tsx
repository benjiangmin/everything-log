"use client";

import { useEffect, useState, useTransition } from "react";
import { unlockQueued } from "@/app/letters/actions";
import type { Letter } from "@/lib/letters";
import LetterItem from "./LetterItem";

const pad = (n: number) => String(n).padStart(2, "0");
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Sealed letters (from the sidebar): first your password, then the letters still on the way, to
// read, change or delete. Nothing is shown (not even whether there are any) until the password
// checks out, and closing the panel locks it again.
export default function SealedLettersPanel({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [given, setGiven] = useState<string | null>(null); // kept only while the panel is open
  const [letters, setLetters] = useState<Letter[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function unlock(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await unlockQueued(password);
      if (!res.ok) return setMessage(res.message);
      setGiven(password);
      setLetters(res.letters);
      setPassword("");
      setMessage(null);
    });
  }

  // After an edit or delete: fetch the list again.
  const refresh = () => {
    if (given !== null) unlockQueued(given).then((res) => res.ok && setLetters(res.letters));
  };

  // Locked: just the password, in the middle of the screen.
  if (letters === null) {
    return (
      <div className="fixed inset-0 z-[70] grid place-items-center p-4">
        <button type="button" aria-label="Cancel" onClick={onClose} className="absolute inset-0 bg-ink/30" />
        <form onSubmit={unlock} className="panel-pop relative w-full max-w-sm rounded-card bg-paper p-5 shadow-2xl shadow-ink/25">
          <h2 className="font-display text-lg font-semibold">Sealed letters</h2>
          <p className="mt-1 text-sm text-muted">Enter your password to look.</p>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            aria-label="Password"
            autoComplete="current-password"
            style={{ outline: "none" }}
            className="mt-4 w-full rounded-control border border-line bg-surface px-3 py-2.5 text-ink placeholder:text-muted/70 focus:border-ink"
          />
          {message && <p className="mt-2 text-sm text-danger">{message}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-control px-4 py-2 text-sm text-muted hover:bg-surface hover:text-ink">
              Cancel
            </button>
            <button type="submit" disabled={pending || !password} className="rounded-control bg-accent px-5 py-2 text-sm font-semibold text-accent-ink hover:opacity-90 disabled:opacity-50">
              {pending ? "…" : "Unlock"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // Unlocked: the letters on the way, sliding in from the right like the other panels.
  return (
    <div className="fixed inset-0 z-[70]">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/30" />
      <aside aria-label="Sealed letters" className="panel-slide absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-paper shadow-2xl shadow-ink/30">
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="font-display text-xl font-semibold">Sealed letters</h2>
            <p className="text-sm text-muted">On their way to you. Closing this locks them again.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close and lock" title="Close and lock" className="grid size-9 place-items-center rounded-control text-muted transition-colors hover:bg-surface hover:text-ink">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-gutter:stable] [scrollbar-width:thin]">
          {letters.length === 0 ? (
            <p className="rounded-card border border-dashed border-line px-5 py-8 text-center text-muted">Nothing on the way.</p>
          ) : (
            <ul className="space-y-2">
              {letters.map((l) => (
                <LetterItem key={l.id} letter={l} today={today()} onChanged={refresh} />
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
