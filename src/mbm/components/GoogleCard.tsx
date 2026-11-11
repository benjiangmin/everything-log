"use client";

import { useTransition } from "react";
import { disconnectGoogle } from "@/app/mbm/actions";

// Google Calendar on the Minute by Minute home page: connect it (so best guesses know your
// classes and plans), or see that it's connected and disconnect it.
export default function GoogleCard({ status, note }: { status: { connected: boolean; email: string | null; syncedAt: string | null } | null; note?: string }) {
  const [pending, run] = useTransition();
  const message =
    note === "connected"
      ? "Connected. Your events are in."
      : note === "cancelled"
        ? "Not connected (you cancelled)."
        : note === "not-set-up"
          ? "Google isn't set up on the website yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)."
          : note === "try-again"
            ? "That didn't go through: try again."
            : note?.startsWith("error:")
              ? note.slice(6)
              : null;
  return (
    <section aria-label="Google Calendar" className="mt-6 flex flex-wrap items-center gap-3 rounded-card border border-line px-5 py-4">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-ink">
        <rect x="3.5" y="5" width="17" height="15.5" rx="3" stroke="currentColor" strokeWidth="2" />
        <path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Google Calendar</p>
        <p className="text-sm text-muted">
          {status === null
            ? "Run supabase/minute-by-minute/030_suggestions.sql to turn this on."
            : status.connected
              ? `Connected${status.email ? ` as ${status.email}` : ""}: best guesses know your events.`
              : "Connect it so best guesses know your classes and plans."}
        </p>
        {message && <p className="mt-1 text-sm text-ink">{message}</p>}
      </div>
      {status &&
        (status.connected ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(async () => void (await disconnectGoogle()))}
            className="rounded-control px-3 py-2 text-sm text-muted ring-1 ring-line transition-colors hover:bg-surface hover:text-ink"
          >
            {pending ? "Disconnecting…" : "Disconnect"}
          </button>
        ) : (
          <a href="/mbm/google/connect" className="rounded-control bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition-opacity hover:opacity-90">
            Connect
          </a>
        ))}
    </section>
  );
}
