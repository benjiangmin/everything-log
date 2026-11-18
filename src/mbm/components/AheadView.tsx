"use client";

import { useEffect, useRef, useState } from "react";
import { aheadItems, ageAt, RACE_LABEL, yearsLeft, type Profile } from "@/mbm/life";
import AboutYouForm from "./AboutYouForm";
import AboutYouSteps from "./AboutYouSteps";

const YEAR_DAYS = 365.2425;
// A fixed scatter of stars for the header (x, y in %, radius).
const STARS: [number, number, number][] = [
  [8, 18, 0.35], [15, 62, 0.25], [23, 30, 0.3], [31, 80, 0.2], [38, 12, 0.25], [46, 48, 0.3], [52, 22, 0.2], [58, 70, 0.35],
  [64, 38, 0.25], [70, 14, 0.3], [76, 58, 0.2], [82, 28, 0.35], [88, 76, 0.25], [93, 44, 0.3], [97, 16, 0.2], [42, 88, 0.25],
];
const yrs = (n: number) => (n >= 10 ? n.toFixed(0) : n.toFixed(1));
const perDay = (secs: number) => {
  const m = Math.round(secs / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`;
};

// Your life as one bar: lived (dark) and likely left. Below, what the rest is likely to go to;
// hover one and its share is shaded off the end of the bar.
export default function AheadView({
  profile,
  averages,
  colors,
  renderedAt,
}: {
  profile: Profile | null;
  averages: { days: number; perDay: Record<string, number>; screenPerDay: number } | null;
  colors: Record<string, string>;
  renderedAt: number;
}) {
  const [editing, setEditing] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  // Shown: sleep and phone to start, then whatever you add or remove (this browser remembers).
  const [shownKeys, setShownKeys] = useState<string[]>(["Sleep", "screen"]);
  const [query, setQuery] = useState("");
  // Stuck at the top: the bar shrinks to just itself. Its slot keeps the full height (the card
  // shrinks inside it), so the page below never moves; otherwise shrinking moved the page, which
  // unstuck it, which grew it, which stuck it again: the jitter.
  const sentinel = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const [slot, setSlot] = useState<number | null>(null);
  useEffect(() => {
    if (!stuck && card.current) {
      const h = card.current.offsetHeight;
      queueMicrotask(() => setSlot(h));
    }
  }, [stuck, editing]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < 80), { rootMargin: "-72px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [editing]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("mbm-future-shown") ?? "null");
      if (Array.isArray(saved)) queueMicrotask(() => setShownKeys(saved.filter((x) => typeof x === "string")));
    } catch {}
  }, []);
  const keep = (next: string[]) => {
    setShownKeys(next);
    try {
      localStorage.setItem("mbm-future-shown", JSON.stringify(next));
    } catch {}
  };

  if (!profile?.birthday || editing) {
    return (
      <section>
        <p className="text-sm font-semibold uppercase tracking-wider text-muted">Looking ahead</p>
        <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight sm:text-5xl">Your whole life, on one bar</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Tell us a little about you and we&apos;ll show how much of a typical life for someone like you you&apos;ve lived, how much is likely left, and where the rest of it
          tends to go.
        </p>
        <div className="mt-8 rounded-card border border-line bg-paper p-6 sm:p-8">
          {/* First time: one question at a time. After that: everything at once. */}
          {profile?.birthday ? <AboutYouForm profile={profile} onDone={() => setEditing(false)} /> : <AboutYouSteps />}
        </div>
      </section>
    );
  }

  const age = ageAt(profile.birthday, renderedAt);
  const left = yearsLeft(age, profile.sex, profile.race, profile.state);
  const total = age + left;
  const livedPct = (age / total) * 100;
  const all = aheadItems(averages, colors).map((it) => ({ ...it, years: (left * it.perDay) / 86400 }));
  const items = all.filter((it) => shownKeys.includes(it.key));
  const addable = all.filter((it) => !items.includes(it));
  const matches = addable.filter((it) => it.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6);
  const add = (key: string) => {
    keep([...shownKeys, key]);
    setQuery("");
  };
  const ticks = Array.from({ length: Math.floor(total / 5) }, (_, k) => (k + 1) * 5);
  const taken = items.reduce((n, it) => n + it.years, 0);
  const shown = hover === "all" ? taken : (items.find((it) => it.key === hover)?.years ?? 0);
  const shownColor = items.find((it) => it.key === hover)?.color ?? "#3e281b";
  const who = [profile.sex, profile.race && profile.race !== "other" ? RACE_LABEL(profile.race) : null, profile.state ? `in ${profile.state}` : null].filter(Boolean).join(", ");

  return (
    <section>
      {/* The page's one loud thing: a night sky, and how far through you are, set big. */}
      <header className="relative overflow-hidden rounded-[28px] px-7 pb-8 pt-7 text-[#f6eee3] sm:px-10" style={{ background: "radial-gradient(120% 140% at 85% 0%, #5a3d2b 0%, #2b1d15 55%, #1f150f 100%)" }}>
        {STARS.map(([x, y, r], k) => (
          <span
            key={k}
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full bg-[#f6eee3]"
            style={{ left: `${x}%`, top: `${y}%`, width: r * 8, height: r * 8, opacity: 0.25 + (k % 4) * 0.12 }}
          />
        ))}
        <div className="relative flex items-start justify-between gap-4">
          <p className="text-sm text-[#cbb9a4]">{profile.name ? `${profile.name}, looking ahead` : "Looking ahead"}</p>
          <button type="button" onClick={() => setEditing(true)} className="-mr-2 -mt-1 rounded-control px-3 py-1.5 text-sm font-semibold text-[#cbb9a4] hover:bg-white/10 hover:text-[#f6eee3]">
            Edit your details
          </button>
        </div>
        <p className="relative mt-4 flex flex-wrap items-baseline gap-x-4">
          <span className="num font-display text-[clamp(4.5rem,12vw,8.5rem)] font-semibold leading-[0.9] tracking-tighter">{Math.round(livedPct)}%</span>
          <span className="font-display text-2xl font-semibold leading-tight sm:text-3xl">
            of a typical life,
            <br />
            lived so far.
          </span>
        </p>
      </header>

      {/* The bar: stays at the top while you scroll the list (shrinking to just the bar), so you
          can see it and what you're hovering at the same time. */}
      <div ref={sentinel} aria-hidden="true" className="mt-4 h-px" />
      {/* (The wrapper's paper fills the gap under the top bar, so nothing peeks through above it.) */}
      {/* The slot (full height, see above). The strip of paper above the card covers the gap
          under the top bar; below the card it's see-through, so its rounded corners stay round. */}
      <div className="pointer-events-none sticky top-16 z-30" style={slot ? { height: slot + 8 } : undefined}>
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-6 bg-paper" />
      <div
        ref={card}
        className={`pointer-events-auto relative mt-2 rounded-card border bg-paper transition-[padding,box-shadow,border-color] duration-300 ease-out ${
          stuck ? "border-line/60 px-5 py-3 shadow-xl shadow-ink/10" : "border-line p-6"
        }`}
      >
        <div className="relative h-5 text-sm">
          <span className="absolute left-0 text-muted">Born</span>
          {/* You, now: over the line where the dark part ends. */}
          <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${Math.min(88, Math.max(12, livedPct))}%` }}>
            <span className="num font-semibold">{age.toFixed(1)}</span> <span className="text-muted">you, now</span>
          </span>
          <span className="absolute right-0 text-muted">
            {shown > 0 ? (
              <span className="text-ink">
                <span className="num font-semibold">−{yrs(shown)} years</span> {hover === "all" ? "all of these" : items.find((it) => it.key === hover)?.label.toLowerCase()}
              </span>
            ) : (
              <>
                around <span className="num font-semibold text-ink">{total.toFixed(0)}</span>
              </>
            )}
          </span>
        </div>
        <div className={`relative mt-2 overflow-hidden rounded-[14px] bg-surface ring-1 ring-inset ring-line transition-[height] duration-300 ease-out ${stuck ? "h-9" : "h-14"}`}>
          <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${livedPct}%` }} />
          {/* Every 5 years a faint line, every 10 a stronger one. */}
          {ticks.map((y) => (
            <div
              key={y}
              aria-hidden="true"
              className={`absolute inset-y-0 w-px ${y < age ? "bg-paper" : "bg-ink"} ${y % 10 ? "opacity-[0.12]" : "opacity-25"}`}
              style={{ left: `${(y / total) * 100}%` }}
            />
          ))}
          {/* Shaded off the end: what the hovered thing takes. */}
          <div
            aria-hidden="true"
            className="absolute inset-y-0 right-0 transition-[width,opacity] duration-300 ease-out"
            style={{
              width: `${(shown / total) * 100}%`,
              opacity: shown ? 1 : 0,
              background: `repeating-linear-gradient(135deg, ${shownColor}cc 0 6px, ${shownColor}88 6px 12px)`,
            }}
          />
          {/* Now. */}
          <div className="absolute inset-y-0 w-0.5 bg-paper" style={{ left: `${livedPct}%` }} />
        </div>
        {/* The decades. */}
        <div className="relative mt-1.5 h-4 text-[11px] text-muted">
          {ticks
            .filter((y) => y % 10 === 0 && y > 0 && (y / total) * 100 < 97)
            .map((y) => (
              <span key={y} className="num absolute -translate-x-1/2" style={{ left: `${(y / total) * 100}%` }}>
                {y}
              </span>
            ))}
        </div>
      </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {/* Your age the way people say it (20, not 20.5 rounded up), then the months. */}
        <Stat
          label="Lived"
          value={`${Math.floor(age)} years`}
          note={`${Math.floor((age % 1) * 12)} months on top · ${Math.floor(age * YEAR_DAYS).toLocaleString()} days`}
        />
        <Stat label="Likely left" value={`${yrs(left)} years`} note={`about ${Math.round(left * 52.18).toLocaleString()} weeks`} />
        <Stat label="Left over" value={`${yrs(Math.max(0, left - taken))} years`} note="after everything below" onHover={(on) => setHover(on ? "all" : null)} />
      </div>

      {/* Where it goes. */}
      <div className="mt-6 rounded-card border border-line bg-paper p-6">
        <h2 className="font-display text-xl font-semibold">Where the rest is likely to go</h2>
        <p className="mt-1 text-sm text-muted">The things that last a lifetime, at the rate you live now. Hover one to see its share of the bar.</p>
        <ul className="mt-5 divide-y divide-line">
          {items.map((it) => (
            <li
              key={it.key}
              onMouseEnter={() => setHover(it.key)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(it.key)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              className={`-mx-3 flex items-center gap-4 rounded-control px-3 py-3.5 outline-none transition-colors ${hover === it.key ? "bg-surface" : ""}`}
            >
              <span className="size-3 shrink-0 rounded-full" style={{ background: it.color }} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{it.label}</p>
                <p className="text-xs text-muted">
                  {perDay(it.perDay)} a day · {it.mine ? `from ${it.source}` : it.source}
                </p>
              </div>
              <div className="text-right">
                <p className="num font-semibold">{yrs(it.years)} years</p>
                <p className="num text-xs text-muted">{Math.round((it.years / left) * 100)}% of what&apos;s left</p>
              </div>
              {(
                <button
                  type="button"
                  onClick={() => keep(shownKeys.filter((x) => x !== it.key))}
                  aria-label={`Remove ${it.label}`}
                  className="-mr-1 grid size-8 place-items-center rounded-control text-muted hover:bg-paper hover:text-ink"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
        {/* Anything else: only when you ask for it. */}
        {addable.length > 0 && (
          <div className="relative mt-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches[0]) add(matches[0].key);
                if (e.key === "Escape") setQuery("");
              }}
              placeholder="+ Add something else (search what you track)"
              className="w-full rounded-control border border-line bg-paper px-3 py-2.5 text-sm placeholder:text-muted focus:border-ink"
              style={{ outline: "none" }}
            />
            {query.trim() && (
              <ul className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-control border border-line bg-paper shadow-xl shadow-ink/10">
                {matches.length ? (
                  matches.map((it) => (
                    <li key={it.key}>
                      <button type="button" onClick={() => add(it.key)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-surface">
                        <span className="size-2.5 rounded-full" style={{ background: it.color }} aria-hidden="true" />
                        <span className="flex-1 font-semibold">{it.label}</span>
                        <span className="text-muted">{perDay(it.perDay)} a day</span>
                      </button>
                    </li>
                  ))
                ) : (
                  <li className="px-3 py-2.5 text-sm text-muted">Nothing tracked by that name.</li>
                )}
              </ul>
            )}
          </div>
        )}
        {(averages?.days ?? 0) < 7 && (
          <p className="mt-4 rounded-control bg-surface px-4 py-3 text-sm text-muted">
            These use U.S. averages until there&apos;s a week of your own days to go on ({averages?.days ?? 0} so far). Then they switch to yours.
          </p>
        )}
      </div>

      <p className="mt-6 text-xs leading-relaxed text-muted">
        An average for people like you ({who || "everyone in the U.S."}), not a prediction for you. Years left: CDC/NCHS{" "}
        <a className="underline" href="https://www.cdc.gov/nchs/data/nvsr/nvsr75/nvsr75-05.pdf" target="_blank" rel="noreferrer">
          United States Life Tables, 2024
        </a>
        , adjusted by your state from{" "}
        <a className="underline" href="https://stacks.cdc.gov/view/cdc/174620" target="_blank" rel="noreferrer">
          U.S. State Life Tables, 2022
        </a>
        . Averages: BLS{" "}
        <a className="underline" href="https://www.bls.gov/news.release/atus.htm" target="_blank" rel="noreferrer">
          American Time Use Survey, 2024
        </a>{" "}
        and Census ACS 2024 commute times.
      </p>
    </section>
  );
}

function Stat({ label, value, note, onHover }: { label: string; value: string; note: string; onHover?: (on: boolean) => void }) {
  return (
    <div
      onMouseEnter={onHover ? () => onHover(true) : undefined}
      onMouseLeave={onHover ? () => onHover(false) : undefined}
      className="rounded-card bg-surface px-5 py-4"
    >
      <p className="text-sm text-muted">{label}</p>
      <p className="num mt-1 font-display text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted">{note}</p>
    </div>
  );
}
