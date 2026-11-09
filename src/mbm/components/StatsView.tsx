"use client";

import { useState } from "react";
import type { Range, Stats } from "@/mbm/stats";
import { clock, dayKeyOf } from "@/mbm/time";
import { openMbm } from "./open";

// The numbers for a day / week / month / year: totals up top, then time per activity (with a
// search: "time spent on …"), time per app, and the untracked stretches.

const hm = (seconds: number) => {
  const mins = Math.round(seconds / 60);
  if (mins < 1) return seconds > 0 ? "<1m" : "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h.toLocaleString()}h ${String(m).padStart(2, "0")}m` : `${m}m`;
};
const miles = (m: number) => {
  const mi = m / 1609.344;
  return mi >= 10 ? `${Math.round(mi).toLocaleString()} mi` : `${mi.toFixed(1)} mi`;
};
const LIST = 8; // shown before "Show all"

export default function StatsView({ stats, range, tz, dayKey, isNow }: { stats: Stats; range: Range; tz: string; dayKey: string; isNow: boolean }) {
  const elapsed = Math.max(0, (+new Date(stats.to) - +new Date(stats.from)) / 1000);
  const unmarked = Math.max(0, elapsed - stats.tracked_seconds);
  const screen = stats.apps.reduce((s, a) => s + a.seconds, 0);
  const pct = (s: number) => (elapsed > 0 ? Math.round((s / elapsed) * 100) : 0);
  const sofar = isNow ? " so far" : "";

  return (
    <div className="mt-6 flex flex-col gap-8">
      {/* ---------- Totals ---------- */}
      <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={`Tracked${sofar}`} value={hm(stats.tracked_seconds)} note={`${pct(stats.tracked_seconds)}% of the time`} />
        <Tile label="Unmarked" value={hm(unmarked)} note={`${stats.gaps.length} stretch${stats.gaps.length === 1 ? "" : "es"} of 10m+`} />
        <Tile label="Screen time" value={hm(screen)} note={`${stats.apps.length} app${stats.apps.length === 1 ? "" : "s"}`} />
        <Tile label="Distance" value={miles(stats.distance_m)} note="from your route dots" />
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <TimeSpent activities={stats.activities} elapsed={elapsed} />
        <Apps apps={stats.apps} />
      </div>

      <Unmarked gaps={stats.gaps} range={range} tz={tz} dayKey={dayKey} />
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-card bg-surface px-5 py-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="num mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{note}</p>
    </div>
  );
}

function Card({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section aria-label={title} className="rounded-card border border-line p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

// A row with a bar showing its share of the biggest one.
function Row({ color, label, seconds, max, note }: { color?: string; label: string; seconds: number; max: number; note?: string }) {
  return (
    <li className="py-1.5">
      <div className="flex items-baseline gap-2 text-sm">
        {color && <span aria-hidden="true" className="size-2.5 shrink-0 translate-y-[-1px] rounded-full" style={{ background: color }} />}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {note && <span className="text-xs text-muted">{note}</span>}
        <span className="num font-semibold">{hm(seconds)}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full" style={{ width: `${max > 0 ? Math.max(2, (seconds / max) * 100) : 0}%`, background: color ?? "var(--ink)", opacity: color ? 1 : 0.55 }} />
      </div>
    </li>
  );
}

function TimeSpent({ activities, elapsed }: { activities: Stats["activities"]; elapsed: number }) {
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  const query = q.trim().toLowerCase();
  const found = query ? activities.filter((a) => a.name.toLowerCase().includes(query)) : activities;
  const shown = query || all ? found : found.slice(0, LIST);
  const max = activities[0]?.seconds ?? 0;
  const total = found.reduce((s, a) => s + a.seconds, 0);
  return (
    <Card title="Time spent">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Time spent on…"
        aria-label="Find time spent on something"
        className="mb-3 w-full rounded-control border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
      />
      {query && (
        <p className="mb-2 text-sm">
          {found.length ? (
            <>
              <span className="num font-semibold">{hm(total)}</span> on “{q.trim()}”
              {elapsed > 0 && <span className="text-muted"> · {Math.round((total / elapsed) * 100)}% of the time</span>}
            </>
          ) : (
            <span className="text-muted">No time on “{q.trim()}” here.</span>
          )}
        </p>
      )}
      {activities.length === 0 ? (
        <p className="text-sm text-muted">Nothing tracked yet.</p>
      ) : (
        <ul>
          {shown.map((a) => (
            <Row key={a.name} color={a.color} label={a.name} seconds={a.seconds} max={max} />
          ))}
        </ul>
      )}
      {!query && found.length > LIST && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
          {all ? "Show fewer" : `Show all ${found.length}`}
        </button>
      )}
    </Card>
  );
}

function Apps({ apps }: { apps: Stats["apps"] }) {
  const [all, setAll] = useState(false);
  const max = apps[0]?.seconds ?? 0;
  return (
    <Card title="Screen time by app">
      {apps.length === 0 ? (
        <p className="text-sm text-muted">No app use recorded. (It comes from the Shortcuts automation on your phone.)</p>
      ) : (
        <ul>
          {(all ? apps : apps.slice(0, LIST)).map((a) => (
            <Row key={a.app} label={a.app} seconds={a.seconds} max={max} />
          ))}
        </ul>
      )}
      {apps.length > LIST && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
          {all ? "Show fewer" : `Show all ${apps.length}`}
        </button>
      )}
    </Card>
  );
}

// Untracked stretches. A day: all of them, in order, each one clickable to fill in. Longer: the
// longest few, with their dates.
function Unmarked({ gaps, range, tz, dayKey }: { gaps: Stats["gaps"]; range: Range; tz: string; dayKey: string }) {
  const len = (g: Stats["gaps"][number]) => +new Date(g.end) - +new Date(g.start);
  const list = range === "day" ? gaps : [...gaps].sort((a, b) => len(b) - len(a)).slice(0, LIST);
  const date = (at: string) => new Date(at).toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
  return (
    <Card title={range === "day" ? "Unmarked stretches" : "Longest unmarked stretches"} aside={<span className="text-xs text-muted">10 minutes or longer</span>}>
      {list.length === 0 ? (
        <p className="text-sm text-muted">Every minute is accounted for.</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((g) => (
            <li key={g.start} className="flex items-center gap-3 py-2 text-sm">
              {range !== "day" && <span className="w-28 shrink-0 text-muted">{date(g.start)}</span>}
              <span className="num flex-1">
                {clock(g.start, tz)} – {clock(g.end, tz)}
                {range !== "day" && dayKeyOf(new Date(g.start), tz) !== dayKeyOf(new Date(g.end), tz) && <span className="text-muted"> (next day)</span>}
              </span>
              <span className="num font-semibold">{hm(len(g) / 1000)}</span>
              {range === "day" && (
                <button
                  type="button"
                  onClick={() => openMbm({ kind: "add", dayKey, from: +new Date(g.start), to: +new Date(g.end) })}
                  className="rounded-control px-2 py-1 text-xs text-muted ring-1 ring-line transition-colors hover:bg-surface hover:text-ink"
                >
                  Fill in
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
