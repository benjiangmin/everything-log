"use client";

import { useEffect, useRef, useState } from "react";
import type { Activity, Block } from "@/mbm/data";
import { span } from "@/mbm/time";
import NowStatus from "./NowStatus";
import { openMbm } from "./open";
import { useNow } from "./useNow";

// What's running, kept small: a button in the bottom-left corner showing it (with its timer).
// Hover (or click) it for the full box (Stop, + Start, Switch); nothing running: click to start.
export default function NowChip({ activities, running, tz, renderedAt }: { activities: Activity[]; running: Block[]; tz: string; renderedAt: number }) {
  const t = useNow(renderedAt);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const byId = new Map(activities.map((a) => [a.id, a]));
  const first = running[0];
  const a = first?.activity_id ? byId.get(first.activity_id) : undefined;

  // Opens when you hover it (and closes a moment after you leave, so you can move into the box).
  const leaving = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enter = () => {
    if (leaving.current) clearTimeout(leaving.current);
    setOpen(true);
  };
  const leave = () => {
    leaving.current = setTimeout(() => setOpen(false), 350);
  };

  // Close on a click elsewhere, or Escape.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={box} onMouseEnter={enter} onMouseLeave={leave} className="fixed bottom-5 left-5 z-40 flex flex-col items-start gap-2">
      {/* The box fades in, and out (kept on the page so it can fade both ways). */}
      <div
          aria-hidden={!open}
          inert={!open}
          className={`w-[min(30rem,calc(100vw-2.5rem))] rounded-card shadow-2xl shadow-ink/25 ring-1 ring-line transition-[opacity,visibility] ease-out motion-reduce:transition-none ${
            open ? "visible opacity-100 duration-200" : "invisible opacity-0 duration-300"
          }`}
        >
          <NowStatus activities={activities} running={running} tz={tz} renderedAt={renderedAt} compact />
      </div>
      <button
        type="button"
        onClick={() => (running.length ? setOpen(true) : openMbm({ kind: "now" }))}
        aria-expanded={running.length ? open : undefined}
        className="flex max-w-[calc(100vw-2.5rem)] items-center gap-2.5 rounded-full bg-accent py-2.5 pl-3.5 pr-4 text-sm font-semibold text-accent-ink shadow-xl shadow-ink/25 transition-transform hover:scale-[1.02]"
      >
        {first ? (
          <>
            <span className="relative grid size-2.5 shrink-0 place-items-center" aria-hidden="true">
              <span className="absolute inline-flex size-2.5 animate-ping rounded-full opacity-50" style={{ background: a?.color ?? "#d4a373" }} />
              <span className="relative size-2.5 rounded-full ring-1 ring-accent-ink/40" style={{ background: a?.color ?? "#d4a373" }} />
            </span>
            <span className="truncate">{a?.name ?? "Something"}</span>
            <span className="num shrink-0 font-normal opacity-75">{span(t - +new Date(first.started_at))}</span>
            {running.length > 1 && <span className="shrink-0 rounded-full bg-accent-ink/15 px-1.5 text-xs">+{running.length - 1}</span>}
          </>
        ) : (
          <>
            <span aria-hidden="true" className="text-base leading-none">+</span>
            <span>What are you doing?</span>
          </>
        )}
      </button>
    </div>
  );
}
