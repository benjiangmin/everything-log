"use client";

import { useState } from "react";
import { aheadItems, ageAt, RACE_LABEL, yearsLeft, type Profile } from "@/mbm/life";
import AboutYouForm from "./AboutYouForm";

const YEAR_DAYS = 365.2425;
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

  if (!profile?.birthday || editing) {
    return (
      <section>
        <p className="text-sm font-semibold uppercase tracking-wider text-muted">Looking ahead</p>
        <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight sm:text-5xl">Your whole life, on one bar</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Tell us a little about you and we&apos;ll show how much of a typical life for someone like you you&apos;ve lived, how much is likely left, and where the rest of it
          tends to go.
        </p>
        <div className="mt-8 rounded-card border border-line bg-paper p-6">
          <AboutYouForm profile={profile} onDone={profile?.birthday ? () => setEditing(false) : undefined} />
        </div>
      </section>
    );
  }

  const age = ageAt(profile.birthday, renderedAt);
  const left = yearsLeft(age, profile.sex, profile.race, profile.state);
  const total = age + left;
  const livedPct = (age / total) * 100;
  const items = aheadItems(averages, colors).map((it) => ({ ...it, years: (left * YEAR_DAYS * it.perDay) / 86400 / YEAR_DAYS }));
  const taken = items.reduce((n, it) => n + it.years, 0);
  const shown = hover === "all" ? taken : (items.find((it) => it.key === hover)?.years ?? 0);
  const shownColor = items.find((it) => it.key === hover)?.color ?? "#3e281b";
  const who = [profile.sex, profile.race && profile.race !== "other" ? RACE_LABEL(profile.race) : null, profile.state ? `in ${profile.state}` : null].filter(Boolean).join(", ");

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-muted">Looking ahead{profile.name ? ` · ${profile.name}` : ""}</p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight sm:text-5xl">{Math.round(livedPct)}% of the way through</h1>
        </div>
        <button type="button" onClick={() => setEditing(true)} className="rounded-control px-3 py-2 text-sm font-semibold text-muted hover:bg-surface hover:text-ink">
          Edit your details
        </button>
      </div>

      {/* The bar. */}
      <div className="mt-8 rounded-card border border-line bg-paper p-6">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted">Born</span>
          <span className="text-muted">
            around <span className="num font-semibold text-ink">{total.toFixed(0)}</span>
          </span>
        </div>
        <div className="relative mt-2 h-14 overflow-hidden rounded-[14px] bg-surface ring-1 ring-inset ring-line">
          <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${livedPct}%` }} />
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
        <div className="relative mt-2 h-10 text-sm">
          <div className="absolute -translate-x-1/2 text-center" style={{ left: `${Math.min(92, Math.max(8, livedPct))}%` }}>
            <p className="num font-semibold">{age.toFixed(1)}</p>
            <p className="text-xs text-muted">you, now</p>
          </div>
          {shown > 0 && (
            <div className="absolute right-0 text-right">
              <p className="num font-semibold">−{yrs(shown)} years</p>
              <p className="text-xs text-muted">{hover === "all" ? "all of these" : items.find((it) => it.key === hover)?.label.toLowerCase()}</p>
            </div>
          )}
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Stat label="Lived" value={`${yrs(age)} years`} note={`${Math.round(age * YEAR_DAYS).toLocaleString()} days`} />
          <Stat label="Likely left" value={`${yrs(left)} years`} note={`about ${Math.round(left * 52.18).toLocaleString()} weeks`} />
          <Stat label="Left over" value={`${yrs(Math.max(0, left - taken))} years`} note="after everything below" onHover={(on) => setHover(on ? "all" : null)} />
        </div>
      </div>

      {/* Where it goes. */}
      <div className="mt-6 rounded-card border border-line bg-paper p-6">
        <h2 className="font-display text-xl font-semibold">Where the rest is likely to go</h2>
        <p className="mt-1 text-sm text-muted">At the rate you live now. Hover one to see its share of the bar.</p>
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
            </li>
          ))}
        </ul>
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
