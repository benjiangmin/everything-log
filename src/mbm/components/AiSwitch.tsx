"use client";

import { useState, useTransition } from "react";
import { setAiSuggestions, setNeverSuggest, setUntrackedAfter } from "@/app/mbm/actions";
import Select from "./Select";

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

// After how long untracked the phone asks (083). Off by default.
const AFTER = [
  { value: "", label: "Off" },
  ...[15, 30, 45, 60, 90, 120, 180].map((m) => ({ value: String(m), label: m < 60 ? `${m} minutes` : m === 60 ? "1 hour" : `${m / 60} hours` })),
];
export function UntrackedAfter({ value, needsSql }: { value: number | null; needsSql: boolean }) {
  const [v, setV] = useState(value == null ? "" : String(value));
  const [message, setMessage] = useState<string | null>(needsSql ? "Run supabase/minute-by-minute/083_untracked_nudge.sql in Supabase first." : null);
  const [, run] = useTransition();
  const options = AFTER.some((o) => o.value === v) ? AFTER : [...AFTER, { value: v, label: `${v} minutes` }];
  return (
    <div>
      <Select
        value={v}
        options={options}
        label="Ask after"
        disabled={needsSql}
        onChange={(next) => {
          const was = v;
          setV(next);
          setMessage(null);
          run(async () => {
            const res = await setUntrackedAfter(next ? Number(next) : null);
            if (!res.ok) {
              setV(was);
              setMessage(res.message);
            }
          });
        }}
      />
      {message && <p className="mt-2 text-sm text-danger">{message}</p>}
    </div>
  );
}

type Job = { id: string; name: string; color: string };

// Never suggest (085): the jobs left out, each with a ×, and a search to add one.
export function NeverSuggest({ jobs, chosen, needsSql }: { jobs: Job[]; chosen: string[]; needsSql: boolean }) {
  const [ids, setIds] = useState(chosen);
  const [q, setQ] = useState("");
  const [message, setMessage] = useState<string | null>(needsSql ? "Run supabase/minute-by-minute/085_never_suggest.sql in Supabase first." : null);
  const [, run] = useTransition();
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const save = (next: string[]) => {
    const was = ids;
    setIds(next);
    setMessage(null);
    run(async () => {
      const res = await setNeverSuggest(next);
      if (!res.ok) {
        setIds(was);
        setMessage(res.message);
      }
    });
  };
  const found = q.trim() ? jobs.filter((j) => !ids.includes(j.id) && j.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];
  return (
    <div>
      {ids.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2">
          {ids
            .map((id) => byId.get(id))
            .filter((j): j is Job => !!j)
            .map((j) => (
              <li key={j.id} className="flex items-center gap-2 rounded-full bg-surface py-1 pl-3 pr-1 text-sm ring-1 ring-line">
                <span className="size-2.5 rounded-full" style={{ background: j.color }} />
                {j.name}
                <button
                  type="button"
                  onClick={() => save(ids.filter((x) => x !== j.id))}
                  aria-label={`Suggest ${j.name} again`}
                  className="grid size-6 place-items-center rounded-full text-muted hover:bg-line/60 hover:text-ink"
                >
                  <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </li>
            ))}
        </ul>
      )}
      <input
        value={q}
        disabled={needsSql}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Add a job…"
        className="w-full rounded-control bg-paper px-4 py-2.5 text-sm outline-none ring-1 ring-line focus:ring-muted disabled:opacity-60"
      />
      {found.length > 0 && (
        <ul className="mt-1 overflow-hidden rounded-control ring-1 ring-line">
          {found.map((j) => (
            <li key={j.id}>
              <button
                type="button"
                onClick={() => {
                  save([...ids, j.id]);
                  setQ("");
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-surface"
              >
                <span className="size-2.5 rounded-full" style={{ background: j.color }} />
                {j.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {message && <p className="mt-2 text-sm text-danger">{message}</p>}
    </div>
  );
}
