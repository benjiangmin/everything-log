"use client";

import { useState, useTransition } from "react";
import { stopNow, switchTo } from "@/app/mbm/actions";
import type { Activity, Block } from "@/mbm/data";
import { clock, span } from "@/mbm/time";
import ActivityInput from "./ActivityInput";
import { useNow } from "./useNow";

const AGO = [
  { m: 0, label: "Now" },
  { m: 5, label: "5m ago" },
  { m: 15, label: "15m ago" },
  { m: 30, label: "30m ago" },
];

// "What are you doing now?": what's running (and for how long), a box to switch, your usual
// activities as one-tap buttons, and when it started (now, or a few minutes ago if you forgot).
export default function NowCard({
  activities,
  now: current,
  tz,
  renderedAt,
  compact = false,
}: {
  activities: Activity[];
  now: Block | null;
  tz: string;
  renderedAt: number;
  compact?: boolean; // the home page's version
}) {
  const t = useNow(renderedAt);
  const [text, setText] = useState("");
  const [ago, setAgo] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const byId = new Map(activities.map((a) => [a.id, a]));
  const doing = current?.activity_id ? byId.get(current.activity_id) : undefined;
  const quick = activities.filter((a) => a.id !== current?.activity_id).slice(0, compact ? 6 : 8);

  function go(name: string) {
    if (!name.trim()) return;
    setMessage(null);
    start(async () => {
      const res = await switchTo(name, ago);
      if (res.ok) {
        setText("");
        setAgo(0);
      } else setMessage(res.message);
    });
  }

  return (
    <div className={`rounded-card bg-surface ${compact ? "p-4" : "p-4 sm:p-5"} ${pending ? "opacity-70" : ""}`}>
      {/* What's running */}
      <div className="flex items-center gap-3">
        <span className="relative grid size-3 shrink-0 place-items-center" aria-hidden="true">
          {current && <span className="absolute inline-flex size-3 animate-ping rounded-full opacity-40" style={{ background: doing?.color ?? "var(--muted)" }} />}
          <span className="relative size-3 rounded-full" style={{ background: current ? (doing?.color ?? "var(--muted)") : "var(--line)" }} />
        </span>
        <div className="min-w-0 flex-1">
          {current ? (
            <>
              <p className={`truncate font-display font-semibold leading-tight ${compact ? "text-lg" : "text-xl sm:text-2xl"}`}>{doing?.name ?? "Something"}</p>
              <p className="num text-sm text-muted">
                since {clock(current.started_at, tz)} · {span(t - +new Date(current.started_at))}
              </p>
            </>
          ) : (
            <p className={`font-display font-semibold text-muted ${compact ? "text-lg" : "text-xl"}`}>Not tracking right now</p>
          )}
        </div>
        {current && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await stopNow();
                if (!res.ok) setMessage(res.message);
              })
            }
            className="shrink-0 rounded-control px-3 py-2 text-sm text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            Stop
          </button>
        )}
      </div>

      {/* Switch */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(text);
        }}
        className="mt-3 flex gap-2"
      >
        <ActivityInput activities={activities} value={text} onChange={setText} onEnter={go} placeholder="What are you doing now?" />
        <button
          type="submit"
          disabled={pending || !text.trim()}
          className="shrink-0 rounded-control bg-accent px-4 font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "…" : "Start"}
        </button>
      </form>

      {/* One tap: your usual ones */}
      {quick.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {quick.map((a) => (
            <button
              key={a.id}
              type="button"
              disabled={pending}
              onClick={() => go(a.name)}
              className="flex items-center gap-1.5 rounded-full bg-paper px-3 py-1.5 text-sm text-ink ring-1 ring-line transition-colors hover:ring-ink/40 disabled:opacity-50"
            >
              <span className="size-2 rounded-full" style={{ background: a.color }} />
              {a.name}
            </button>
          ))}
        </div>
      )}

      {/* Started when */}
      <div className="mt-3 flex items-center gap-2 text-xs text-muted">
        <span>Started</span>
        <div role="radiogroup" aria-label="Started" className="flex rounded-control bg-paper p-0.5 ring-1 ring-line">
          {AGO.map((o) => (
            <button
              key={o.m}
              type="button"
              role="radio"
              aria-checked={ago === o.m}
              onClick={() => setAgo(o.m)}
              className={`rounded-[9px] px-2.5 py-1 font-semibold transition-colors ${ago === o.m ? "bg-accent text-accent-ink" : "hover:text-ink"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      {message && <p className="mt-2 text-sm text-danger">{message}</p>}
    </div>
  );
}
