"use client";

import { useTransition } from "react";
import { stopEntry } from "@/app/mbm/actions";
import type { Activity, Block } from "@/mbm/data";
import { clock, span } from "@/mbm/time";
import { openMbm } from "./open";
import { useNow } from "./useNow";

// What's running right now: one row each (timer + Stop), then + Start (alongside) and Switch (instead).
// Typing what you're doing happens in the side panel (sidebar → "What are you doing?").
export default function NowStatus({
  activities,
  running,
  tz,
  renderedAt,
  compact = false,
}: {
  activities: Activity[];
  running: Block[];
  tz: string;
  renderedAt: number;
  compact?: boolean;
}) {
  const t = useNow(renderedAt);
  const [pending, run] = useTransition();
  const byId = new Map(activities.map((a) => [a.id, a]));

  return (
    <div className={`flex items-center gap-4 rounded-card bg-surface ${compact ? "px-4 py-3" : "px-5 py-4"} ${pending ? "opacity-70" : ""}`}>
      {running.length === 0 ? (
        <p className={`flex-1 font-display font-semibold text-muted ${compact ? "text-base" : "text-lg"}`}>Not tracking right now</p>
      ) : (
        // One row per thing going on, each with its own Stop (they all line up, left of the button).
        <ul className="min-w-0 flex-1 divide-y divide-line">
          {running.map((b) => {
            const a = b.activity_id ? byId.get(b.activity_id) : undefined;
            return (
              <li key={b.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                <span className="relative grid size-3 shrink-0 place-items-center" aria-hidden="true">
                  <span className="absolute inline-flex size-3 animate-ping rounded-full opacity-40" style={{ background: a?.color ?? "var(--muted)" }} />
                  <span className="relative size-3 rounded-full" style={{ background: a?.color ?? "var(--muted)" }} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`truncate font-display font-semibold leading-tight ${compact ? "text-base" : "text-xl"}`}>{a?.name ?? "Something"}</p>
                  <p className="num whitespace-nowrap text-sm text-muted">
                    since {clock(b.started_at, tz)} · {span(t - +new Date(b.started_at))}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(async () => void (await stopEntry(b.id)))}
                  aria-label={`Stop ${a?.name ?? "it"}`}
                  className="shrink-0 rounded-control px-3 py-2 text-sm font-semibold text-muted transition-colors hover:bg-paper hover:text-ink"
                >
                  Stop
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {/* + Start: adds something alongside (nothing stops). Switch: stops what's running and starts the new thing. */}
      <div className="flex shrink-0 flex-col gap-1.5 self-center sm:flex-row sm:items-center">
        {running.length > 0 && (
          <button
            type="button"
            onClick={() => openMbm({ kind: "now" })}
            className="rounded-control px-3 py-2 text-sm font-semibold text-ink ring-1 ring-line transition-colors hover:bg-paper"
          >
            + Start
          </button>
        )}
        <button
          type="button"
          onClick={() => openMbm({ kind: "now", switch: running.length > 0 })}
          className="rounded-control bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition-opacity hover:opacity-90"
        >
          {running.length ? "Switch" : "What are you doing?"}
        </button>
      </div>
    </div>
  );
}
