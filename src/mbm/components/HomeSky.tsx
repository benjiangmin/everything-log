"use client";

import { sunTimes } from "@/mbm/sun";
import { clock } from "@/mbm/time";
import { useNow } from "./useNow";

// Home's top: the light outside right now. The panel takes the sky's colour for the hour (dawn,
// day, dusk, night), and an arc traces today's sun from sunrise to sunset over where you are,
// with the sun (or the moon, after dark) at this minute.
type Phase = { from: string; to: string; ink: string; muted: string; arc: string };
const PHASES: Record<"night" | "dawn" | "day" | "dusk", Phase> = {
  night: { from: "#2b1d15", to: "#46301f", ink: "#f6eee3", muted: "#cbb9a4", arc: "#f6eee333" },
  dawn: { from: "#f6dcc0", to: "#eab896", ink: "#3e281b", muted: "#7a5a45", arc: "#3e281b33" },
  day: { from: "#f4ead9", to: "#e9d8bb", ink: "#3e281b", muted: "#7d6957", arc: "#3e281b2e" },
  dusk: { from: "#e7c2ad", to: "#9b7690", ink: "#2d1d14", muted: "#4d3540", arc: "#2d1d1433" },
};

export default function HomeSky({ name, tz, lat, lng, renderedAt, dateLabel }: { name: string | null; tz: string; lat: number; lng: number; renderedAt: number; dateLabel: string }) {
  const now = useNow(renderedAt);
  const sun = sunTimes(now, lat, lng);
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(now));
  const H = 3600_000;
  const phase = !sun
    ? "day"
    : now < sun.rise - H || now > sun.set + H
      ? "night"
      : now < sun.rise + H
        ? "dawn"
        : now > sun.set - H
          ? "dusk"
          : "day";
  const p = PHASES[phase];
  const greeting = hour < 5 ? "Up late" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : hour < 22 ? "Good evening" : "Good night";

  // The arc: sunrise on the left, sunset on the right. f: how far along the day's light we are.
  const W = 320;
  const R = 120;
  const f = sun ? Math.min(1, Math.max(0, (now - sun.rise) / (sun.set - sun.rise))) : 0.5;
  const up = sun ? now >= sun.rise && now <= sun.set : true;
  const a = Math.PI * (1 - f);
  const cx = W / 2 + R * Math.cos(a);
  const base = R + 34; // (room above the arc for the sun's glow)
  const cy = base - R * Math.sin(a);

  return (
    <section
      aria-label="Right now outside"
      className="relative overflow-hidden rounded-[28px] px-7 pb-6 pt-7 sm:px-9"
      style={{ background: `linear-gradient(160deg, ${p.from}, ${p.to})`, color: p.ink }}
    >
      <div className="relative z-10 max-w-[60%]">
        <p className="text-sm font-semibold" style={{ color: p.muted }}>
          {dateLabel}
        </p>
        <h1 className="mt-1 font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
          {greeting}
          {name ? `, ${name}` : ""}
        </h1>
        {sun && (
          <p className="mt-3 text-sm" style={{ color: p.muted }}>
            {up
              ? `Sun's up until ${clock(new Date(sun.set), tz)}`
              : now < sun.rise
                ? `Sunrise at ${clock(new Date(sun.rise), tz)}`
                : `The sun set at ${clock(new Date(sun.set), tz)}`}
          </p>
        )}
      </div>
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${W} ${base + 8}`}
        className="pointer-events-none absolute -bottom-1 right-2 w-[min(46%,340px)] sm:right-6"
      >
        <path d={`M ${W / 2 - R} ${base} A ${R} ${R} 0 0 1 ${W / 2 + R} ${base}`} fill="none" stroke={p.arc} strokeWidth="2" strokeDasharray="2 7" strokeLinecap="round" />
        <line x1="0" x2={W} y1={base} y2={base} stroke={p.arc} strokeWidth="2" />
        {up ? (
          <>
            <circle cx={cx} cy={cy} r="22" fill="#f2b950" opacity="0.25" />
            <circle cx={cx} cy={cy} r="11" fill="#f2b950" />
          </>
        ) : (
          // The moon, resting low on the horizon line's far side.
          <g transform={`translate(${now < (sun?.rise ?? 0) ? W / 2 - R + 30 : W / 2 + R - 30} ${base - 40})`}>
            <circle r="12" fill="#f6eee3" />
            <circle cx="5" cy="-4" r="11" fill={p.to} />
          </g>
        )}
      </svg>
    </section>
  );
}
