"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setCalendarHidden, setCalendarIgnored } from "@/app/mbm/actions";

// The Plan tab while it's being rebuilt: just its two calendar settings. (The day planner is in
// PlanView.tsx, kept for when it comes back.)
export default function PlanSettings({ connected, calendarHidden, calendarIgnored }: { connected: boolean; calendarHidden: boolean; calendarIgnored: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const flip = (save: () => Promise<{ ok: true } | { ok: false; message: string }>) =>
    start(async () => {
      const res = await save().catch(() => ({ ok: false as const, message: "Couldn't save that. Check your connection and try again." }));
      if (!res.ok) setMessage(res.message);
      else {
        setMessage(null);
        router.refresh();
      }
    });

  if (!connected)
    return (
      <p className="rounded-control bg-surface px-4 py-2.5 text-sm text-muted">
        <Link href="/google/connect" className="font-semibold text-ink underline underline-offset-2">
          Connect Google Calendar
        </Link>{" "}
        to show your events on the Day bar and use them to start jobs.
      </p>
    );
  return (
    <div className="flex flex-col gap-2 text-sm">
      <Switch on={!calendarHidden} label="Show Google Calendar events" disabled={pending} onToggle={() => flip(() => setCalendarHidden(!calendarHidden))}>
        Show Google Calendar events
        <span className="text-muted"> {calendarHidden ? "(hidden on the Day bar)" : "(on the Day bar)"}</span>
      </Switch>
      <Switch on={!calendarIgnored} label="Use Google Calendar events to start jobs" disabled={pending} onToggle={() => flip(() => setCalendarIgnored(!calendarIgnored))}>
        Use them to start jobs
        <span className="text-muted"> (a job set to start &ldquo;only if it&rsquo;s on my calendar&rdquo;{calendarHidden && !calendarIgnored ? ", even while they're hidden" : ""})</span>
      </Switch>
      {message && <p className="text-danger">{message}</p>}
    </div>
  );
}

// An on/off switch with its words beside it.
function Switch({ on, label, disabled, onToggle, children }: { on: boolean; label: string; disabled: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={onToggle}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${on ? "bg-accent" : "bg-line"}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-paper shadow transition-[left] ${on ? "left-[1.375rem]" : "left-0.5"}`} />
      </button>
      <span>{children}</span>
    </div>
  );
}
