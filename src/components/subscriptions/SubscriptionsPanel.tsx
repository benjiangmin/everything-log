"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { monthlySubscriptions } from "@/app/subscriptions/actions";
import type { Subscription } from "@/lib/subscriptions";
import { billedOn, dollars } from "@/lib/subscription-dates";

// The budget's subscriptions list (from the sidebar): the monthly ones still running, soonest
// charge first, their total, and a link to the Subscriptions page.
export default function SubscriptionsPanel({ onClose }: { onClose: () => void }) {
  const [subs, setSubs] = useState<Subscription[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    monthlySubscriptions().then((res) => {
      if (!live) return;
      if ("error" in res) setError(res.error);
      else setSubs(res.subs);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const total = subs?.reduce((n, s) => n + s.price, 0) ?? 0;

  return (
    <div className="fixed inset-0 z-[70]">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/30" />
      <aside aria-label="Monthly subscriptions" className="panel-slide absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-paper shadow-2xl shadow-ink/30">
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="font-display text-xl font-semibold">Monthly subscriptions</h2>
            <p className="num text-sm text-muted">{subs ? `${dollars(total)} / month` : error ? "" : "Loading…"}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-control text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-width:thin]">
          {error && <p className="rounded-card bg-surface px-4 py-3 text-sm text-danger">{error}</p>}
          {subs && subs.length === 0 && (
            <p className="rounded-card border border-dashed border-line px-5 py-8 text-center text-muted">No monthly subscriptions yet.</p>
          )}
          <ul className="space-y-1.5">
            {subs?.map((s) => (
              <li key={s.id} className="flex items-center gap-3 rounded-control bg-surface px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{s.name}</p>
                  <p className="text-xs text-muted">{s.next_charge ? billedOn(s.next_charge, s.cycle, true) : "No date"}</p>
                </div>
                <p className="num shrink-0 font-semibold text-ink">{dollars(s.price)}</p>
              </li>
            ))}
          </ul>
        </div>

        <footer className="border-t border-line px-5 py-4">
          <Link
            href="/subscriptions"
            onClick={onClose}
            className="flex items-center justify-center gap-2 rounded-control bg-accent px-4 py-2.5 font-semibold text-accent-ink transition-opacity hover:opacity-90"
          >
            See subscriptions
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </footer>
      </aside>
    </div>
  );
}
