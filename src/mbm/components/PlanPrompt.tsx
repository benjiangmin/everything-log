"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { answerPlan } from "@/app/mbm/actions";
import { clock } from "@/mbm/time";
import type { DayPlan } from "./DayBar";

// A plan with no place (it can't start itself when you get there), at its time: "Start work?"
// Start (now), Later (asks again in 15 minutes), or Skip (it's gone from the bar).
const LATER = 15 * 60_000;
const KEY = "mbm-plan-later";

export default function PlanPrompt({ plans, now, tz }: { plans: DayPlan[]; now: number; tz: string }) {
  const router = useRouter();
  const [later, setLater] = useState<Record<string, number>>({});
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, number>;
      const t = setTimeout(() => setLater(saved), 0);
      return () => clearTimeout(t);
    } catch {
      // (not remembered)
    }
  }, []);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const due = plans.filter((p) => !p.at && p.start <= now && p.end > now && (later[p.id] ?? 0) <= now);
  const p = due[0];
  if (!p) return null;

  const snooze = () => {
    const next = { ...later, [p.id]: now + LATER };
    setLater(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // (just this visit)
    }
  };
  const answer = (go: boolean) =>
    start(async () => {
      const res = await answerPlan(p.id, go);
      if (!res.ok) return setMessage(res.message);
      setMessage(null);
      router.refresh();
    });
  return (
    <div role="status" className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card bg-accent px-5 py-3 text-accent-ink shadow-lg shadow-ink/15">
      <p className="min-w-0 flex-1">
        <span className="font-display text-lg font-semibold">Start {p.title || "your plan"}?</span>
        <span className="num ml-2 text-sm opacity-80">
          Planned {clock(new Date(p.start), tz)} – {clock(new Date(p.end), tz)}
        </span>
      </p>
      <div className="flex items-center gap-1.5">
        <button type="button" disabled={pending} onClick={() => answer(true)} className="h-9 rounded-control bg-paper px-4 text-sm font-semibold text-ink hover:bg-surface disabled:opacity-60">
          Start
        </button>
        <button type="button" onClick={snooze} className="h-9 rounded-control px-3 text-sm font-semibold hover:bg-accent-ink/10">
          Later
        </button>
        <button type="button" disabled={pending} onClick={() => answer(false)} className="h-9 rounded-control px-3 text-sm font-semibold opacity-80 hover:bg-accent-ink/10 hover:opacity-100">
          Skip
        </button>
      </div>
      {message && <p className="w-full text-sm">{message}</p>}
    </div>
  );
}
