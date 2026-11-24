"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCalendarOn } from "@/app/mbm/actions";
import type { GCalendar } from "@/mbm/google";

// Which Google calendars Minute by Minute reads: yours, and ones others share with you. Off: its
// events don't show, suggest or start jobs.
export default function CalendarPicker({ calendars }: { calendars: GCalendar[] }) {
  const router = useRouter();
  const [on, setOn] = useState(() => new Map(calendars.map((c) => [c.id, c.on])));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const flip = (c: GCalendar) => {
    const next = !on.get(c.id);
    setOn((m) => new Map(m).set(c.id, next));
    start(async () => {
      const res = await setCalendarOn(c.id, next);
      if (!res.ok) {
        setOn((m) => new Map(m).set(c.id, !next));
        return setMessage(res.message);
      }
      setMessage(null);
      router.refresh();
    });
  };
  return (
    <div>
      <div className="divide-y divide-line rounded-card border border-line bg-paper">
        {calendars.map((c) => {
          const yes = !!on.get(c.id);
          return (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3">
              <span className="size-3 shrink-0 rounded-full" style={{ background: c.color ?? "var(--muted)" }} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className={`block truncate ${yes ? "" : "text-muted"}`}>{c.name}</span>
                {!c.mine && <span className="block text-xs text-muted">Shared with you</span>}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={yes}
                aria-label={`Read ${c.name}`}
                disabled={pending}
                onClick={() => flip(c)}
                className={`relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-60 ${yes ? "bg-accent" : "bg-line"}`}
              >
                <span className={`absolute top-0.5 size-5 rounded-full bg-paper shadow transition-[left] ${yes ? "left-[18px]" : "left-0.5"}`} />
              </button>
            </div>
          );
        })}
      </div>
      {message && <p className="mt-2 text-sm text-danger">{message}</p>}
    </div>
  );
}
