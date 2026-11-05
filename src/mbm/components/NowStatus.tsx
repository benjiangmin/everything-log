"use client";

import { useTransition } from "react";
import { stopEntry } from "@/app/mbm/actions";
import type { Activity, Block } from "@/mbm/data";
import { clock, span } from "@/mbm/time";
import { openMbm } from "./open";
import { useNow } from "./useNow";

// What's running right now (each with its timer), then Stop and Switch on the right.
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
    <div className={`flex flex-wrap items-center gap-x-6 gap-y-3 rounded-card bg-surface ${compact ? "px-4 py-3" : "px-5 py-4"} ${pending ? "opacity-70" : ""}`}>
      {running.length === 0 ? (
        <p className={`flex-1 font-display font-semibold text-muted ${compact ? "text-base" : "text-lg"}`}>Not tracking right now</p>
      ) : (
        <ul className="flex min-w-0 flex-1 flex-wrap gap-x-6 gap-y-2">
          {running.map((b) => {
            const a = b.activity_id ? byId.get(b.activity_id) : undefined;
            return (
              <li key={b.id} className="flex min-w-0 items-center gap-3">
                <span className="relative grid size-3 shrink-0 place-items-center" aria-hidden="true">
                  <span className="absolute inline-flex size-3 animate-ping rounded-full opacity-40" style={{ background: a?.color ?? "var(--muted)" }} />
                  <span className="relative size-3 rounded-full" style={{ background: a?.color ?? "var(--muted)" }} />
                </span>
                <div className="min-w-0">
                  <p className={`truncate font-display font-semibold leading-tight ${compact ? "text-base" : "text-xl"}`}>{a?.name ?? "Something"}</p>
                  <p className="num whitespace-nowrap text-sm text-muted">
                    since {clock(b.started_at, tz)} · {span(t - +new Date(b.started_at))}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex shrink-0 items-center gap-1">
      {running.length > 0 && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(async () => void (await stopEntry()))}
          className="rounded-control px-3 py-2 text-sm font-semibold text-muted transition-colors hover:bg-paper hover:text-ink"
        >
          {running.length > 1 ? "Stop all" : "Stop"}
        </button>
      )}
      <button
        type="button"
        onClick={() => openMbm({ kind: "now" })}
        className="shrink-0 rounded-control bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition-opacity hover:opacity-90"
      >
        {running.length ? "Switch" : "What are you doing?"}
      </button>
      </div>
    </div>
  );
}
