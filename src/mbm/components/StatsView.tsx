"use client";

import { useState, useTransition, type ReactNode } from "react";
import { preload } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setPinned } from "@/app/mbm/actions";
import type { JobMeta, Range, Stats } from "@/mbm/stats";

// The numbers for a day / week / month / year: totals up top, then time per activity (with a
// search: "time spent on …") and time per app.

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
// Hours (a day, a week) or days (a month, a year): one decimal under 100, whole past that.
const amount = (seconds: number, range: Range) => {
  const v = seconds / (range === "day" || range === "week" ? 3600 : 86400);
  return v >= 100 ? Math.round(v).toLocaleString() : String(Math.round(v * 10) / 10);
};

export default function StatsView({
  stats,
  isNow,
  query = "",
  pins = null,
  range,
  dayKey,
  meta = { jobs: {}, categories: {} },
  icons,
}: {
  icons?: Record<string, string | null>; // each app's icon, looked up with the page
  meta?: JobMeta; // categories, goals, hidden jobs (043)
  pins?: string[] | null; // pinned activities (null: 023_pins.sql not run yet)
  stats: Stats;
  range: Range;
  tz: string;
  dayKey: string;
  isNow: boolean;
  query?: string; // start the activity search with this (from the top bar's search)
}) {
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
        {/* A day's Unmarked / Distance: click for that day, zoomed to them and lit up a moment. */}
        <Tile
          label="Unmarked"
          value={hm(unmarked)}
          note={`${stats.gaps.length} stretch${stats.gaps.length === 1 ? "" : "es"} of 10m+`}
          href={range === "day" && unmarked >= 60 ? `/day?day=${dayKey}&show=unmarked` : undefined}
        />
        <Tile label="Screen time" value={hm(screen)} note={`${stats.apps.length} app${stats.apps.length === 1 ? "" : "s"}`} />
        <Tile label="Distance" value={miles(stats.distance_m)} note="from your route dots" href={range === "day" ? `/day?day=${dayKey}&show=commutes` : undefined} />
      </section>

      <div className="flex flex-col gap-8">
        <TimeSpent activities={stats.activities} tracked={stats.tracked_seconds} elapsed={elapsed} initial={query} savedPins={pins} meta={meta} range={range} />
        <Apps apps={stats.apps} icons={icons} />
      </div>

      {/* (No list of unmarked stretches any more: the bar shows them, and the Day page fills them in.) */}
    </div>
  );
}

function Tile({ label, value, note, href }: { label: string; value: string; note: string; href?: string }) {
  const router = useRouter();
  const body = (
    <>
      <p className="flex items-center justify-between gap-2 text-sm text-muted">
        {label}
        {href && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="opacity-0 transition-opacity group-hover:opacity-100">
            <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </p>
      <p className="num mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{note}</p>
    </>
  );
  return href ? (
    // (Each click gets its own time, so the day plays it again even if that page was open before.)
    <Link
      href={href}
      onClick={(e) => {
        e.preventDefault();
        router.push(`${href}&at=${Date.now()}`);
      }}
      className="group rounded-card bg-surface px-5 py-4 transition-colors hover:bg-line/70"
    >
      {body}
    </Link>
  ) : (
    <div className="rounded-card bg-surface px-5 py-4">{body}</div>
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

// A row with a bar showing its share of the biggest one. onPick: the row is a button. pin: a pin
// button beside it (always shown when pinned, on hover when not).
function Row({
  color,
  icon,
  label,
  seconds,
  max,
  note,
  onPick,
  pin,
  barColor,
}: {
  barColor?: string; // (the bar's own color, when it isn't the dot's)
  color?: string;
  icon?: ReactNode;
  label: string;
  seconds: number;
  max: number;
  note?: string;
  onPick?: () => void;
  pin?: { pinned: boolean; onToggle: () => void };
}) {
  const body = (
    <>
      <div className={`flex gap-2 text-sm ${icon ? "items-center" : "items-baseline"}`}>
        {icon}
        {color && <span aria-hidden="true" className="size-2.5 shrink-0 translate-y-[-1px] rounded-full" style={{ background: color }} />}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {note && <span className="text-xs text-muted">{note}</span>}
        <span className="num font-semibold">{hm(seconds)}</span>
      </div>
      <div className="mt-1.5 h-3 overflow-hidden rounded-[4.5px] bg-surface">
        <div className="h-full rounded-[4.5px]" style={{ width: `${max > 0 && seconds > 0 ? Math.max(2, (seconds / max) * 100) : 0}%`, background: barColor ?? color ?? "var(--ink)", opacity: barColor || color ? 1 : 0.55 }} />
      </div>
    </>
  );
  const main = onPick ? (
    <button type="button" onClick={onPick} title={`Just ${label}`} className="-mx-2 block w-[calc(100%+1rem)] rounded-control px-2 py-1.5 text-left transition-colors hover:bg-surface/70">
      {body}
    </button>
  ) : (
    <div className="py-1.5">{body}</div>
  );
  if (!pin) return <li>{main}</li>;
  return (
    <li className="group flex items-center gap-1">
      <div className="min-w-0 flex-1">{main}</div>
      <button
        type="button"
        onClick={pin.onToggle}
        aria-label={pin.pinned ? `Unpin ${label}` : `Pin ${label} to the top`}
        title={pin.pinned ? "Unpin" : "Pin to the top"}
        className={`-mr-1.5 grid size-8 shrink-0 place-items-center rounded-full transition hover:bg-surface hover:text-ink focus-visible:opacity-100 ${
          pin.pinned ? "text-ink" : "text-muted opacity-0 group-hover:opacity-100"
        }`}
      >
        <PinIcon filled={pin.pinned} />
      </button>
    </li>
  );
}

function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} aria-hidden="true">
      <path d="M9 3h6l-1 6 3.5 3.5v2H6.5v-2L10 9 9 3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 14.5V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// An app's icon (from the App Store, by its name), or its first letter when there isn't one.
function AppIcon({ name, src, big = false }: { name: string; src?: string | null; big?: boolean }) {
  const [failed, setFailed] = useState(false);
  const box = big ? "size-9 rounded-[9px]" : "size-6 rounded-[7px]";
  // (The page looked it up already: src. null: no match, so the letter straight away.)
  if (src) preload(src, { as: "image" });
  if (failed || src === null) {
    return (
      <span aria-hidden="true" className={`grid ${box} shrink-0 place-items-center bg-surface text-[11px] font-semibold text-muted ring-1 ring-line`}>
        {name.trim().charAt(0).toUpperCase() || "?"}
      </span>
    );
  }
  return (
    // (A soft square behind it while the picture comes in.)
    <span className={`${box} shrink-0 overflow-hidden bg-surface ring-1 ring-ink/10`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- (a picture from the App Store, any size) */}
      <img
        src={src ?? `/app-icon?name=${encodeURIComponent(name)}`}
        alt=""
        width={big ? 36 : 24}
        height={big ? 36 : 24}
        decoding="async"
        onError={() => setFailed(true)}
        className="size-full"
      />
    </span>
  );
}

// Searching matches the start of a word ("work" finds "Working on this project", "k" finds
// nothing), not any letter inside one. Click a row to look at just that one.
const startsAWord = (name: string, q: string) => (" " + name.toLowerCase()).includes(" " + q);

type Sort = "most" | "least" | "az";
const SORTS: { id: Sort; label: string }[] = [
  { id: "most", label: "Most" },
  { id: "least", label: "Least" },
  { id: "az", label: "A–Z" },
];

// Time per activity. Pinned ones always come first (even at 0m, even if there's no activity
// called that yet), then the rest, sorted. Search to narrow it down, or to pin something new.
function TimeSpent({
  activities: everything,
  tracked,
  elapsed,
  initial,
  savedPins,
  meta,
  range,
}: {
  activities: Stats["activities"];
  tracked: number; // all tracked time (pinned ones too)
  elapsed: number;
  initial: string;
  savedPins: string[] | null;
  meta: JobMeta;
  range: Range; // (goals show on a day, a week)
}) {
  const metaOf = (name: string) => meta.jobs[name.trim().toLowerCase()];
  // Jobs set to "Hide from Stats" aren't listed (they're still on the bar).
  const hidden = everything.filter((a) => metaOf(a.name)?.hidden);
  const activities = everything.filter((a) => !metaOf(a.name)?.hidden);
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  // A goal shows only for its own span: a per-day goal on a day, a per-week goal on a week.
  const goalNote = (seconds: number, goal: number | null | undefined, per: "day" | "week" = "week") => {
    if (!goal) return undefined;
    const target = (range === "day" && per === "day") || (range === "week" && per === "week") ? goal : null;
    if (!target) return undefined;
    const t = target < 60 ? `${target}m` : target % 60 ? `${(target / 60).toFixed(1)}h` : `${target / 60}h`;
    return `${Math.round((seconds / 60 / target) * 100)}% of ${t} goal`;
  };
  const [q, setQ] = useState(initial);
  const [sort, setSort] = useState<Sort>("most");
  const [pins, setPins] = useState<string[]>(savedPins ?? []);
  const [problem, setProblem] = useState<string | null>(null);
  const [, start] = useTransition();
  const canPin = true; // (if 023_pins.sql isn't run yet, pinning says so)
  const key = (name: string) => name.trim().toLowerCase();
  const pinnedKeys = new Set(pins.map(key));
  const byKey = new Map(activities.map((a) => [key(a.name), a]));

  const togglePin = (name: string) => {
    const on = !pinnedKeys.has(key(name));
    setPins((list) => (on ? [...list, name.trim()] : list.filter((p) => key(p) !== key(name))));
    setProblem(null);
    start(async () => {
      const r = await setPinned(name, on);
      if (!r.ok) {
        setProblem(r.message);
        setPins((list) => (on ? list.filter((p) => key(p) !== key(name)) : [...list, name.trim()]));
      }
    });
  };

  const query = q.trim().toLowerCase();
  // (Close enough counts too: "devotionals" finds Devotions.)
  const matches = (name: string) => !query || startsAWord(name, query) || sharedStart(key(name), query) >= Math.min(6, query.length);
  const sorter = (a: { name: string; seconds: number }, b: { name: string; seconds: number }) =>
    sort === "az" ? a.name.localeCompare(b.name) : sort === "least" ? a.seconds - b.seconds : b.seconds - a.seconds;

  // Pinned: the activity if there is one (its time, its color), else just the name at 0m.
  const pinned = pins.map((p) => byKey.get(key(p)) ?? { name: p, color: "#cdbca9" as string | undefined, seconds: 0 }).filter((a) => matches(a.name)).sort(sorter);
  // Searching: your jobs with no time here too (0m), so you can find and pin them.
  const idle = query
    ? Object.values(meta.jobs)
        .filter((j) => j.name && !j.hidden && !byKey.has(key(j.name)) && !pinnedKeys.has(key(j.name)) && matches(j.name))
        .map((j) => ({ name: j.name!, color: j.color ?? "#cdbca9", seconds: 0 }))
    : [];
  const rest = [...activities.filter((a) => !pinnedKeys.has(key(a.name)) && matches(a.name)), ...idle].sort(sorter);
  const found = [...pinned, ...rest];
  // Not searching: a category's jobs go under it (one row with their total; click for each).
  type Item = { kind: "job"; a: (typeof rest)[number] } | { kind: "cat"; id: string; name: string; color: string; seconds: number; goal: number | null; per?: "day" | "week"; jobs: typeof rest };
  const items: Item[] = [];
  if (query) rest.forEach((a) => items.push({ kind: "job", a }));
  else {
    const cats = new Map<string, Extract<Item, { kind: "cat" }>>();
    for (const a of rest) {
      const id = metaOf(a.name)?.category;
      const c = id ? meta.categories[id] : undefined;
      if (!id || !c) {
        items.push({ kind: "job", a });
        continue;
      }
      let g = cats.get(id);
      if (!g) cats.set(id, (g = { kind: "cat", id, name: c.name, color: c.color, seconds: 0, goal: c.goal, per: c.per, jobs: [] }));
      g.seconds += a.seconds;
      g.jobs.push(a);
    }
    items.push(...cats.values());
    items.sort((x, y) => sorter(x.kind === "job" ? x.a : x, y.kind === "job" ? y.a : y));
  }
  // The circle: everything (pinned too, so the shares add up), a category as one slice. Over any
  // range, a day too, the bits under 5% go together as Other (click it for what's in it).
  const slices: Slice[] = [];
  {
    const cats = new Map<string, Slice>();
    for (const a of activities) {
      if (a.seconds <= 0) continue;
      const id = metaOf(a.name)?.category;
      const c = id ? meta.categories[id] : undefined;
      if (!id || !c) {
        slices.push({ key: `job:${key(a.name)}`, name: a.name, color: a.color ?? "#cdbca9", seconds: a.seconds, kind: "job", note: goalNote(a.seconds, metaOf(a.name)?.goal, metaOf(a.name)?.per) });
        continue;
      }
      let g = cats.get(id);
      if (!g) cats.set(id, (g = { key: `cat:${id}`, name: c.name, color: c.color, seconds: 0, kind: "cat", jobs: [], goal: c.goal, per: c.per }));
      g.seconds += a.seconds;
      g.jobs!.push({ name: a.name, color: a.color ?? c.color, seconds: a.seconds });
    }
    for (const g of cats.values()) slices.push({ ...g, note: goalNote(g.seconds, g.goal, g.per) });
  }
  const pieTotal = slices.reduce((t, x) => t + x.seconds, 0);
  slices.sort((x, y) => y.seconds - x.seconds);
  {
    const small = slices.filter((x) => pieTotal > 0 && x.seconds / pieTotal < 0.05);
    if (small.length >= 2) {
      const other: Slice = {
        key: "other",
        name: "Other",
        color: "#b9ab9b",
        seconds: small.reduce((t, x) => t + x.seconds, 0),
        kind: "other",
        jobs: small.flatMap((x) => (x.kind === "cat" ? x.jobs!.map((j) => ({ ...j, from: x.name })) : [{ name: x.name, color: x.color, seconds: x.seconds }])).sort((a, b) => b.seconds - a.seconds),
      };
      const big = slices.filter((x) => !small.includes(x));
      slices.length = 0;
      slices.push(...big, other);
    }
  }
  const shownRest = items; // (only listed like this while searching: otherwise the circle)
  const max = Math.max(0, ...pinned.map((a) => a.seconds), ...items.map((i) => (i.kind === "job" ? i.a.seconds : i.seconds)));
  const total = found.reduce((s, a) => s + a.seconds, 0);
  const share = (s: number) => (elapsed > 0 ? ` · ${Math.round((s / elapsed) * 100)}% of the time` : "");
  const one = found.length === 1 ? found[0] : undefined;
  // Searching for something that isn't pinned (and isn't exactly an activity's name... or is):
  // offer to pin it.
  const typed = q.trim();
  const offerPin = canPin && typed && !pinnedKeys.has(key(typed));
  const pinFor = (name: string) => (canPin ? { pinned: pinnedKeys.has(key(name)), onToggle: () => togglePin(name) } : undefined);

  return (
    <Card
      title="Time spent"
      aside={
        <div role="radiogroup" aria-label="Sort by" className="flex rounded-control bg-surface p-0.5 text-xs">
          {SORTS.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={sort === o.id}
              onClick={() => setSort(o.id)}
              className={`rounded-[9px] px-2.5 py-1 font-semibold transition-colors ${sort === o.id ? "bg-paper text-ink shadow-sm" : "text-muted hover:text-ink"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="relative mb-3">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.2" />
          <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQ("")}
          placeholder={canPin ? "Search, or pin something…" : "Search your activities…"}
          aria-label="Search your activities"
          className="w-full rounded-full border border-line bg-paper py-2 pl-9 pr-9 text-sm outline-none transition-colors placeholder:text-muted focus:border-ink [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Clear the search"
            className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
      {offerPin && (
        <button
          type="button"
          onClick={() => {
            togglePin(byKey.get(key(typed))?.name ?? typed);
            setQ("");
          }}
          className="mb-2 flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm text-muted transition-colors hover:bg-surface/70 hover:text-ink"
        >
          <PinIcon filled={false} />
          <span>
            Pin “<span className="font-semibold text-ink">{typed}</span>” to the top
            {!byKey.has(key(typed)) && <span> (nothing on it yet: shows 0m)</span>}
          </span>
        </button>
      )}
      {problem && <p className="mb-2 text-xs text-danger">{problem}</p>}
      {query && (
        <p className="mb-2 text-sm">
          {one ? (
            <>
              <span className="num font-semibold">{hm(one.seconds)}</span> on {one.name}
              <span className="text-muted">{share(one.seconds)}</span>
            </>
          ) : found.length > 1 ? (
            <>
              {found.length} activities match · <span className="num font-semibold">{hm(total)}</span> together
              <span className="text-muted">{share(total)}</span>
            </>
          ) : (
            <span className="text-muted">No activity called “{q.trim()}” here.</span>
          )}
        </p>
      )}
      {!query && (pinned.length > 0 || slices.length > 0) ? (
        <>
          {pinned.length > 0 && (
            <ul className="mb-5">
              {pinned.map((a) => (
                <Row key={`pin-${a.name}`} color={a.color} label={a.name} seconds={a.seconds} max={max} pin={pinFor(a.name)} note={goalNote(a.seconds, metaOf(a.name)?.goal, metaOf(a.name)?.per)} />
              ))}
            </ul>
          )}
          {slices.length > 0 ? (
            <Pie slices={slices} total={pieTotal} sort={sort} pinFor={pinFor} tracked={tracked} elapsed={elapsed} range={range} />
          ) : (
            <p className="text-sm text-muted">Nothing else tracked yet.</p>
          )}
        </>
      ) : found.length === 0 && !query ? (
        <p className="text-sm text-muted">Nothing tracked yet.</p>
      ) : (
        <ul>
          {pinned.map((a) => (
            <Row key={`pin-${a.name}`} color={a.color} label={a.name} seconds={a.seconds} max={max} pin={pinFor(a.name)} note={goalNote(a.seconds, metaOf(a.name)?.goal, metaOf(a.name)?.per)} />
          ))}
          {pinned.length > 0 && shownRest.length > 0 && <li aria-hidden="true" className="my-1.5 border-t border-dashed border-line" />}
          {shownRest.map((i) =>
            i.kind === "job" ? (
              <Row key={i.a.name} color={i.a.color} label={i.a.name} seconds={i.a.seconds} max={max} pin={pinFor(i.a.name)} note={goalNote(i.a.seconds, metaOf(i.a.name)?.goal, metaOf(i.a.name)?.per)} />
            ) : (
              <li key={`cat-${i.id}`}>
                <ul>
                  <Row
                    color={i.color}
                    label={`${openCats.has(i.id) ? "▾" : "▸"} ${i.name}`}
                    seconds={i.seconds}
                    max={max}
                    note={goalNote(i.seconds, i.goal, i.per) ?? `${i.jobs.length} job${i.jobs.length === 1 ? "" : "s"}`}
                    onPick={() =>
                      setOpenCats((set) => {
                        const next = new Set(set);
                        if (next.has(i.id)) next.delete(i.id);
                        else next.add(i.id);
                        return next;
                      })
                    }
                  />
                  {openCats.has(i.id) && (
                    <li className="ml-4 border-l border-line pl-3">
                      <ul>
                        {[...i.jobs].sort(sorter).map((a) => (
                          <Row key={a.name} color={a.color} label={a.name} seconds={a.seconds} max={i.seconds} pin={pinFor(a.name)} note={goalNote(a.seconds, metaOf(a.name)?.goal, metaOf(a.name)?.per)} />
                        ))}
                      </ul>
                    </li>
                  )}
                </ul>
              </li>
            ),
          )}
        </ul>
      )}
      {hidden.length > 0 && !query && (
        <p className="mt-3 text-xs text-muted">
          Not shown: {hidden.map((a) => a.name).join(", ")} (
          <a href="/account/jobs" className="underline underline-offset-2 hover:text-ink">
            settings
          </a>
          ).
        </p>
      )}
    </Card>
  );
}

function Apps({ apps, icons }: { apps: Stats["apps"]; icons?: Record<string, string | null> }) {
  const [all, setAll] = useState(false);
  const max = apps[0]?.seconds ?? 0;
  return (
    <Card title="Screen time by app">
      {apps.length === 0 ? (
        <p className="text-sm text-muted">No app use recorded. (It comes from the Shortcuts automation on your phone.)</p>
      ) : (
        <ul>
          {(all ? apps : apps.slice(0, LIST)).map((a) => (
            // Like the iPhone's Screen Time: the app's icon on the left; its name, time and bar
            // stacked on the right.
            <li key={a.app} className="flex items-center gap-3 py-2">
              <AppIcon name={a.app} src={icons?.[a.app]} big />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{a.app}</span>
                  <span className="num text-muted">{hm(a.seconds)}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface">
                  <div className="h-full rounded-full bg-[#b9ab9b]" style={{ width: `${max > 0 ? Math.max(2, (a.seconds / max) * 100) : 0}%` }} />
                </div>
              </div>
            </li>
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

// How many letters two names start with in common.
function sharedStart(a: string, b: string) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

// ---------- The circle ----------
type Slice = {
  key: string;
  name: string;
  color: string;
  seconds: number;
  kind: "job" | "cat" | "other";
  note?: string;
  jobs?: { name: string; color: string; seconds: number; from?: string }[]; // (a category's, or what's in Other)
  goal?: number | null;
  per?: "day" | "week";
};

const pctOf = (s: number, total: number) => {
  const p = total > 0 ? (s / total) * 100 : 0;
  return p > 0 && p < 1 ? "<1%" : `${Math.round(p)}%`;
};

// A ring of everything tracked, each slice its share, with the list beside it. Pointing at a
// slice or a row lights up both; a category or Other opens to show what's in it.
function Pie({
  slices,
  total,
  sort,
  pinFor,
  tracked,
  elapsed,
  range,
}: {
  tracked: number; // all of it, pinned ones too (the circle leaves those out)
  elapsed: number; // how much of the day / week / … has gone by so far
  range: Range;
  slices: Slice[];
  total: number;
  sort: Sort;
  pinFor: (name: string) => { pinned: boolean; onToggle: () => void } | undefined;
}) {
  const [lit, setLit] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [all, setAll] = useState(false);
  const toggle = (k: string) =>
    setOpen((set) => {
      const next = new Set(set);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  // The ring (always biggest first, clockwise from the top), a hair of gap between slices.
  const R = 74;
  const W = 34;
  const C = 100;
  const gap = slices.length > 1 ? 0.012 : 0;
  const fracs = slices.map((sl) => (total > 0 ? sl.seconds / total : 0));
  const starts = fracs.map((_, i) => fracs.slice(0, i).reduce((t, f) => t + f, 0));
  const arcs = slices.map((sl, i) => {
    const a0 = starts[i] + gap / 2;
    const a1 = Math.max(starts[i] + fracs[i] - gap / 2, a0 + 0.002);
    return { sl, a0, a1 };
  });
  const point = (f: number, r: number) => [C + r * Math.sin(f * 2 * Math.PI), C - r * Math.cos(f * 2 * Math.PI)];
  const arc = (a0: number, a1: number, r: number) => {
    if (a1 - a0 >= 0.999) return `M ${C} ${C - r} A ${r} ${r} 0 1 1 ${C - 0.01} ${C - r}`;
    const [x0, y0] = point(a0, r);
    const [x1, y1] = point(a1, r);
    return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 0.5 ? 1 : 0} 1 ${x1} ${y1}`;
  };
  const shown = lit ? slices.find((x) => x.key === lit) : undefined;

  // The list: in the order picked up top (Other always last).
  const other = slices.find((x) => x.kind === "other");
  const listed = slices
    .filter((x) => x.kind !== "other")
    .sort((a, b) => (sort === "az" ? a.name.localeCompare(b.name) : sort === "least" ? a.seconds - b.seconds : b.seconds - a.seconds));
  if (other) listed.push(other);
  const rows = all ? listed : listed.slice(0, LIST);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 sm:grid-cols-[17rem_minmax(0,1fr)] sm:gap-10">
      <div className="relative mx-auto aspect-square w-64 sm:sticky sm:top-6 sm:w-[17rem]">
        <svg viewBox="0 0 200 200" className="size-full" role="img" aria-label="Share of tracked time">
          <circle cx={C} cy={C} r={R} fill="none" stroke="var(--surface)" strokeWidth={W} />
          {arcs.map(({ sl, a0, a1 }) => (
            <path
              key={sl.key}
              d={arc(a0, a1, R)}
              fill="none"
              stroke={sl.color}
              strokeWidth={lit === sl.key ? W + 8 : W}
              strokeLinecap="butt"
              opacity={lit && lit !== sl.key ? 0.3 : 1}
              className="cursor-pointer transition-[opacity,stroke-width] duration-150"
              onPointerEnter={() => setLit(sl.key)}
              onPointerLeave={() => setLit(null)}
              onClick={() => sl.kind !== "job" && toggle(sl.key)}
            >
              <title>{`${sl.name}: ${hm(sl.seconds)} (${pctOf(sl.seconds, total)})`}</title>
            </path>
          ))}
        </svg>
        {/* (Kept inside the hole: a long name wraps to two lines, then ends in "…".) */}
        <div className="pointer-events-none absolute inset-y-0 left-1/2 flex w-[46%] -translate-x-1/2 flex-col items-center justify-center text-center">
          {shown ? (
            <>
              <span className="line-clamp-2 break-words text-xs leading-tight text-muted">{shown.name}</span>
              <span className="num mt-0.5 font-display text-xl font-semibold tracking-tight">{hm(shown.seconds)}</span>
              <span className="num text-xs text-muted">{pctOf(shown.seconds, total)}</span>
            </>
          ) : (
            <>
              {/* Tracked out of the time gone by: hours for a day or week, days for a month or year. */}
              <span className="num font-display text-2xl font-semibold tracking-tight">
                {amount(tracked, range)}
                <span className="text-base font-medium text-muted">/{amount(elapsed, range)}</span>
              </span>
              <span className="text-xs text-muted">{range === "day" || range === "week" ? "hours tracked" : "days tracked"}</span>
            </>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <ul className="flex flex-col">
          {rows.map((sl) => {
            const opens = sl.kind !== "job";
            const isOpen = open.has(sl.key);
            const pin = sl.kind === "job" ? pinFor(sl.name) : undefined;
            const body = (
              <span className="flex items-baseline gap-2.5 text-sm">
                <span aria-hidden="true" className="size-2.5 shrink-0 translate-y-[-1px] self-center rounded-full" style={{ background: sl.color }} />
                <span className="min-w-0 flex-1 truncate">
                  {sl.name}
                  {opens && (
                    <span className="ml-1.5 text-xs text-muted">
                      {sl.jobs!.length} {sl.jobs!.length === 1 ? "job" : "jobs"} {isOpen ? "▾" : "▸"}
                    </span>
                  )}
                </span>
                {sl.note && <span className="hidden text-xs text-muted sm:inline">{sl.note}</span>}
                <span className="num w-10 text-right text-xs text-muted">{pctOf(sl.seconds, total)}</span>
                <span className="num w-[4.75rem] whitespace-nowrap text-right font-semibold">{hm(sl.seconds)}</span>
              </span>
            );
            return (
              <li key={sl.key} onPointerEnter={() => setLit(sl.key)} onPointerLeave={() => setLit(null)} className="group">
                <div className={`-mx-2 flex items-center rounded-control transition-colors ${lit === sl.key ? "bg-surface/80" : ""}`}>
                  {opens ? (
                    <button type="button" onClick={() => toggle(sl.key)} aria-expanded={isOpen} className="min-w-0 flex-1 px-2 py-2 text-left">
                      {body}
                    </button>
                  ) : (
                    <div className="min-w-0 flex-1 px-2 py-2">{body}</div>
                  )}
                  {pin ? (
                    <button
                      type="button"
                      onClick={pin.onToggle}
                      aria-label={pin.pinned ? `Unpin ${sl.name}` : `Pin ${sl.name} to the top`}
                      title={pin.pinned ? "Unpin" : "Pin to the top"}
                      className={`grid size-8 shrink-0 place-items-center rounded-full transition hover:bg-surface hover:text-ink focus-visible:opacity-100 ${
                        pin.pinned ? "text-ink" : "text-muted opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      <PinIcon filled={pin.pinned} />
                    </button>
                  ) : (
                    <span className="size-8 shrink-0" />
                  )}
                </div>
                {opens && isOpen && (
                  <ul className="mb-1 ml-1 border-l border-line pl-4">
                    {sl.jobs!.map((j) => (
                      <li key={`${j.from ?? ""}${j.name}`} className="flex items-baseline gap-2.5 py-1 pr-10 text-sm">
                        <span aria-hidden="true" className="size-2 shrink-0 self-center rounded-full" style={{ background: j.color }} />
                        <span className="min-w-0 flex-1 truncate">
                          {j.name}
                          {j.from && <span className="ml-1.5 text-xs text-muted">in {j.from}</span>}
                        </span>
                        <span className="num w-10 text-right text-xs text-muted">{pctOf(j.seconds, total)}</span>
                        <span className="num w-[4.75rem] whitespace-nowrap text-right text-muted">{hm(j.seconds)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        {listed.length > LIST && (
          <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
            {all ? "Show fewer" : `Show all ${listed.length}`}
          </button>
        )}
      </div>
    </div>
  );
}
