"use client";

import { useState, useTransition } from "react";
import { setAiSuggestions } from "@/app/mbm/actions";

// AI suggestions on or off (081). Off by default.
export default function AiSwitch({ on: start, needsSql, ready }: { on: boolean; needsSql: boolean; ready: boolean }) {
  const [on, setOn] = useState(start);
  const [message, setMessage] = useState<string | null>(needsSql ? "Run supabase/minute-by-minute/081_ai_suggestions.sql in Supabase first." : null);
  const [pending, run] = useTransition();
  const flip = () => {
    const next = !on;
    setOn(next);
    setMessage(null);
    run(async () => {
      const res = await setAiSuggestions(next);
      if (!res.ok) {
        setOn(!next);
        setMessage(res.message);
      }
    });
  };
  return (
    <div>
      <div className="flex items-center justify-between gap-4 rounded-control bg-paper px-4 py-3 ring-1 ring-line">
        <span className="text-sm font-semibold">{on ? "On" : "Off"}</span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="AI suggestions"
          disabled={pending || needsSql}
          onClick={flip}
          className={`relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-60 ${on ? "bg-accent" : "bg-line"}`}
        >
          <span className={`absolute top-0.5 size-5 rounded-full bg-paper shadow transition-[left] ${on ? "left-[18px]" : "left-0.5"}`} />
        </button>
      </div>
      {on && !ready && <p className="mt-2 text-sm text-muted">AI isn&apos;t set up on the website yet, so suggestions work as before for now.</p>}
      {message && <p className="mt-2 text-sm text-danger">{message}</p>}
    </div>
  );
}
