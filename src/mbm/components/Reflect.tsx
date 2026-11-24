"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { Day } from "@/mbm/data";
import { clock, span } from "@/mbm/time";
import { isMoving } from "@/mbm/moving";
import { metres } from "@/mbm/trips";
import { atLabel, useReflectOpen } from "@/mbm/reflectAt";
import DayMap from "./DayMap";
import type { Focus } from "./DayMapInner";
import { layOut } from "./segments";

// Reflect: the day played back, one thing at a time. The map behind follows along (the place you
// were, lit up; a commute walked along its route), the bar fills in as the time goes by, and the
// day ends on a summary under the night sky. Today's opens in the evening (Your account → Reflect).

type Scene = {
  start: number;
  end: number;
  name: string;
  color: string;
  note: string | null;
  kind: "entry" | "gap";
  moving: boolean;
  where: string | null; // the place(s) you were, or "Theory → Russell Labs" for a trip
  also: { name: string; color: string }[]; // things going on at the same time
  app: { name: string; ms: number } | null; // most of your phone time then
  ms: number; // how long it plays for
};

const GAP_COLOR = "#b9ab9b";
const SPEEDS = [1, 2, 4];
// Smooth in, smooth out: the playhead (and anyone walking) eases between the ends of each thing.
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const unease = (y: number) => {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (ease(mid) < y) lo = mid;
    else hi = mid;
  }
  return lo;
};

export default function Reflect({ day, today, title, name, prev, next }: { day: Day; today: boolean; title: string; name: string | null; prev: string; next: string | null }) {
  const { open, wait, at } = useReflectOpen();
  if (today && !open) {
    // (Before the browser knows the time: nothing yet, so it doesn't flash locked.)
    if (wait === null) return <div className="size-full bg-paper" />;
    return <Locked wait={wait} at={at} prev={prev} />;
  }
  return <Player day={day} today={today} title={title} name={name} prev={prev} next={next} />;
}

function Player({ day, today, title, name, prev, next }: { day: Day; today: boolean; title: string; name: string | null; prev: string; next: string | null }) {
  const router = useRouter();
  const dayStart = +new Date(day.start);
  const dayEnd = +new Date(day.end);
  const now = today ? Math.min(dayEnd, day.loadedAt) : dayEnd;
  const byId = useMemo(() => new Map(day.activities.map((a) => [a.id, a])), [day.activities]);

  const { scenes, summary, barFrom, barTo, placed } = useMemo(() => {
    const laid = layOut(day.blocks, dayStart, dayEnd, now);
    const nameOf = (id: string | null) => (id ? byId.get(id) : undefined);
    const placesIn = (a: number, b: number) =>
      day.visits
        .filter((v) => Math.min(b, v.departed_at ? +new Date(v.departed_at) : now) - Math.max(a, +new Date(v.arrived_at)) > 60_000)
        .map((v) => v.place ?? v.auto_name)
        .filter((n): n is string => !!n)
        .filter((n, i, all) => all.indexOf(n) === i);
    const topApp = (a: number, b: number) => {
      const by = new Map<string, number>();
      for (const u of day.phone) {
        if (u.kind !== "app" || !u.app) continue;
        const ms = Math.min(b, u.ended_at ? +new Date(u.ended_at) : now) - Math.max(a, +new Date(u.started_at));
        if (ms > 0) by.set(u.app, (by.get(u.app) ?? 0) + ms);
      }
      const best = [...by].sort((x, y) => y[1] - x[1])[0];
      return best && best[1] >= 2 * 60_000 ? { name: best[0], ms: best[1] } : null;
    };
    const playFor = (ms: number, moving: boolean, gap: boolean) => {
      const min = ms / 60_000;
      let t = Math.min(6500, Math.max(2600, 2400 + 1100 * Math.log2(1 + min / 20)));
      if (moving) t = Math.max(t, 5200);
      if (gap) t = Math.max(2200, t * 0.7);
      return t;
    };

    // The main line of the day (the first row on the bar) and the untracked stretches; anything
    // on a row below goes along with what it's under.
    const main = laid.placed.filter((p) => p.lane === 0);
    const under = laid.placed.filter((p) => p.lane > 0);
    const out: Scene[] = [];
    for (const p of main) {
      if (p.end - p.start < 2 * 60_000) continue;
      const a = nameOf(p.block.activity_id);
      const moving = isMoving(a?.name);
      const places = placesIn(p.start, p.end);
      out.push({
        start: p.start,
        end: p.end,
        name: a?.name ?? "Something",
        color: a?.color ?? "#a98467",
        note: p.block.note,
        kind: "entry",
        moving,
        where: moving ? tripWhere(day.visits, p.start, p.end, now) : places.length ? places.join(", then ") : null,
        also: under.filter((u) => u.start < p.end && u.end > p.start).map((u) => ({ name: nameOf(u.block.activity_id)?.name ?? "Something", color: nameOf(u.block.activity_id)?.color ?? "#a98467" })),
        app: topApp(p.start, p.end),
        ms: playFor(p.end - p.start, moving, false),
      });
    }
    for (const g of laid.gaps) {
      if (g.end - g.start < 5 * 60_000) continue;
      const places = placesIn(g.start, g.end);
      out.push({
        start: g.start,
        end: g.end,
        name: "Untracked",
        color: GAP_COLOR,
        note: null,
        kind: "gap",
        moving: false,
        where: places.length ? places.join(", then ") : null,
        also: [],
        app: topApp(g.start, g.end),
        ms: playFor(g.end - g.start, false, true),
      });
    }
    out.sort((x, y) => x.start - y.start);

    // For the start and the end: totals.
    const per = new Map<string, { name: string; color: string; ms: number }>();
    for (const p of laid.placed) {
      const a = nameOf(p.block.activity_id);
      const k = a?.id ?? "?";
      const row = per.get(k) ?? { name: a?.name ?? "Something", color: a?.color ?? "#a98467", ms: 0 };
      row.ms += p.end - p.start;
      per.set(k, row);
    }
    const places = new Set(day.visits.map((v) => v.place ?? v.auto_name ?? `${v.lat.toFixed(4)},${v.lng.toFixed(4)}`));
    const first = out[0]?.start ?? dayStart;
    const last = out.at(-1)?.end ?? now;
    return {
      scenes: out,
      placed: laid.placed,
      summary: { tracked: laid.covered, top: [...per.values()].sort((x, y) => y.ms - x.ms).slice(0, 3), places: places.size, miles: distance(day.points) / 1609.344 },
      barFrom: Math.max(dayStart, first - 15 * 60_000),
      barTo: Math.min(dayEnd, last + 15 * 60_000),
    };
  }, [day, dayStart, dayEnd, now, byId]);

  const [stage, setStage] = useState<"intro" | "play" | "outro">("intro");
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [pos, setPos] = useState({ idx: 0, elapsed: 0 });
  const scene = scenes[pos.idx];
  const p = scene ? ease(Math.min(1, pos.elapsed / scene.ms)) : 0;
  const playT = scene ? scene.start + p * (scene.end - scene.start) : barFrom;

  // The clock that moves it all along.
  useEffect(() => {
    if (stage !== "play" || !playing || !scenes.length) return;
    let last = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const dt = Math.min(100, t - last) * speed;
      last = t;
      setPos((s) => {
        const sc = scenes[s.idx];
        let e = s.elapsed + dt;
        if (e < sc.ms) return { idx: s.idx, elapsed: e };
        if (s.idx + 1 >= scenes.length) return { idx: s.idx, elapsed: sc.ms };
        e -= sc.ms;
        return { idx: s.idx + 1, elapsed: Math.min(e, 50) };
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage, playing, speed, scenes]);

  // The last thing played through: on to the night sky.
  const finished = stage === "play" && !!scene && pos.idx === scenes.length - 1 && pos.elapsed >= scene.ms;
  useEffect(() => {
    if (!finished) return;
    const id = setTimeout(() => setStage("outro"), 700);
    return () => clearTimeout(id);
  }, [finished]);

  const go = (idx: number) => {
    setPos({ idx: Math.max(0, Math.min(scenes.length - 1, idx)), elapsed: 0 });
    if (stage !== "play") setStage("play");
  };
  const seek = (t: number) => {
    const i = scenes.findIndex((s) => t < s.end);
    const idx = i === -1 ? scenes.length - 1 : i;
    const s = scenes[idx];
    const frac = Math.min(1, Math.max(0, (t - s.start) / Math.max(1, s.end - s.start)));
    setPos({ idx, elapsed: unease(frac) * s.ms });
  };
  const begin = () => {
    setPos({ idx: 0, elapsed: 0 });
    setPlaying(true);
    setStage("play");
  };

  // Keys: space plays / pauses, ← → step through, Esc back to the day.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === " ") {
        e.preventDefault();
        if (stage === "intro") begin();
        else if (stage === "play") setPlaying((v) => !v);
      } else if (e.key === "ArrowRight" && stage === "play") go(pos.idx + 1);
      else if (e.key === "ArrowLeft" && stage === "play") go(pos.elapsed > 1200 ? pos.idx : pos.idx - 1);
      else if (e.key === "Escape") router.push(`/day?day=${day.dayKey}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // What the map shows: the thing playing, lit up (and walked, when it's a trip).
  const focus = useMemo<Focus | null>(() => {
    if (stage !== "play" || !scene) return null;
    return { start: scene.start, end: scene.end, kind: scene.moving ? "moving" : scene.kind === "gap" ? "any" : "still" };
  }, [stage, scene]);
  const step = Math.round(p * 240) / 240; // (the walker moves in small steps: smooth, without redrawing the map every frame)
  const walk = useMemo(() => {
    if (stage !== "play" || !scene || (!scene.moving && scene.kind !== "gap")) return null;
    return { start: scene.start, end: scene.end, t: scene.start + step * (scene.end - scene.start), color: scene.moving ? scene.color : "#7f5539" };
  }, [stage, scene, step]);
  const follow = useMemo(() => ({ top: 84, bottom: 300 }), []);
  const empty = day.visits.length === 0 && day.points.length === 0;
  const glow = stage === "play" && scene ? scene.color : stage === "outro" ? "#1d140f" : "#7f5539";

  if (!scenes.length) {
    return (
      <Night>
        <div className="relative z-10 mx-auto flex h-full max-w-md flex-col items-center justify-center px-6 text-center text-[#faf6f0]">
          <p className="font-display text-3xl font-semibold">Nothing to look back on yet</p>
          <p className="mt-2 text-sm opacity-70">Nothing was tracked on {title}. Fill in the day, then come back.</p>
          <div className="mt-6 flex gap-3">
            <Link href={`/day?day=${day.dayKey}`} className="rounded-full bg-[#faf6f0] px-5 py-2.5 text-sm font-semibold text-[#2b1c14]">
              Open the day
            </Link>
            <Link href={`/reflect?day=${prev}`} className="rounded-full px-5 py-2.5 text-sm font-semibold ring-1 ring-[#faf6f0]/30">
              The day before
            </Link>
          </div>
        </div>
      </Night>
    );
  }

  return (
    <div className="reflect relative size-full" style={{ "--reflect-glow": glow } as CSSProperties}>
      {/* The map, the whole screen. Just to watch: hovering, clicking and dragging it do nothing
          (pointing at a route used to light it up and pull the camera off the walk). */}
      <div className={`pointer-events-none absolute inset-0 flex flex-col transition-[filter] duration-700 ${stage === "play" ? "" : "blur-[2px] saturate-50"}`}>
        {empty ? <div className="size-full bg-[radial-gradient(circle_at_50%_40%,var(--surface),var(--paper))]" /> : <DayMap day={day} focus={focus} walk={walk} follow={follow} gestures="none" bare chrome={false} />}
      </div>
      {/* A glow in the color of what's playing, rising from the bottom. */}
      <div aria-hidden="true" className="reflect-glow-layer pointer-events-none absolute inset-0 z-10" />

      {/* Top: where you are, and the way out. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 p-4 sm:p-5">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-paper/85 p-1 pl-4 shadow-lg shadow-ink/10 ring-1 ring-ink/10 backdrop-blur-md">
          <MoonIcon />
          <span className="ml-1.5 mr-2 font-display text-sm font-semibold">{title}</span>
          <Link href={`/reflect?day=${prev}`} aria-label="The day before" className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink">
            <Chevron left />
          </Link>
          {next ? (
            <Link href={`/reflect?day=${next}`} aria-label="The day after" className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink">
              <Chevron />
            </Link>
          ) : (
            <span className="grid size-8 place-items-center text-muted opacity-30">
              <Chevron />
            </span>
          )}
        </div>
        <Link
          href={`/day?day=${day.dayKey}`}
          className="pointer-events-auto flex items-center gap-2 rounded-full bg-paper/85 px-4 py-2 text-sm font-semibold shadow-lg shadow-ink/10 ring-1 ring-ink/10 backdrop-blur-md transition-colors hover:bg-paper"
        >
          Done
        </Link>
      </div>

      {stage === "play" && scene && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3 sm:p-5">
          <div className="pointer-events-auto mx-auto max-w-5xl rounded-[28px] bg-paper/90 p-4 shadow-2xl shadow-ink/25 ring-1 ring-ink/10 backdrop-blur-xl sm:p-5">
            <Caption key={pos.idx} scene={scene} p={p} n={pos.idx + 1} of={scenes.length} tz={day.tz} />
            <Bar placed={placed} scenes={scenes} idx={pos.idx} playT={playT} from={barFrom} to={barTo} dayStart={dayStart} tz={day.tz} byId={byId} onSeek={seek} />
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <RoundButton label="Back" onClick={() => go(pos.elapsed > 1200 ? pos.idx : pos.idx - 1)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M6 5h2.5v14H6zM20 5.5v13L9.5 12z" />
                  </svg>
                </RoundButton>
                <button
                  type="button"
                  onClick={() => setPlaying((v) => !v)}
                  aria-label={playing ? "Pause" : "Play"}
                  className="grid size-12 place-items-center rounded-full bg-accent text-accent-ink shadow-lg shadow-accent/30 transition-transform hover:scale-105 active:scale-95"
                >
                  {playing ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M6.5 5h4v14h-4zM13.5 5h4v14h-4z" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M8 5.5v13l10.5-6.5z" />
                    </svg>
                  )}
                </button>
                <RoundButton label="Next" onClick={() => (pos.idx + 1 >= scenes.length ? setStage("outro") : go(pos.idx + 1))}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M15.5 5H18v14h-2.5zM4 5.5v13L14.5 12z" />
                  </svg>
                </RoundButton>
              </div>
              <div className="flex items-center gap-1 rounded-full bg-surface p-1 text-xs font-semibold">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSpeed(s)}
                    aria-pressed={speed === s}
                    className={`num rounded-full px-2.5 py-1 transition-colors ${speed === s ? "bg-paper text-ink shadow-sm" : "text-muted hover:text-ink"}`}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {stage === "intro" && <Intro title={title} today={today} summary={summary} onBegin={begin} count={scenes.length} />}
      {stage === "outro" && <Outro name={name} today={today} title={title} summary={summary} onAgain={begin} dayKey={day.dayKey} />}
    </div>
  );
}

// What's playing: its name (big, in its color), when, for how long (counting up as it plays),
// where, and what else was going on.
function Caption({ scene, p, n, of, tz }: { scene: Scene; p: number; n: number; of: number; tz: string }) {
  const gap = scene.kind === "gap";
  return (
    <div className="reflect-in mb-10 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div className="min-w-0">
        <p className="num mb-1 text-xs font-semibold text-muted">
          {n} of {of}
        </p>
        <p className="flex items-center gap-3 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl" style={{ color: gap ? "var(--muted)" : undefined }}>
          <span aria-hidden="true" className="reflect-dot size-4 shrink-0 rounded-full" style={{ background: scene.color, boxShadow: `0 0 0 6px color-mix(in srgb, ${scene.color} 22%, transparent)` }} />
          <span className="min-w-0">{scene.name}</span>
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span className="num">
            {clock(new Date(scene.start), tz)} – {clock(new Date(scene.end), tz)}
          </span>
          {scene.where && (
            <span className="flex items-center gap-1">
              <PinIcon />
              {scene.where}
            </span>
          )}
          {scene.note && <span className="italic opacity-80">{scene.note}</span>}
        </div>
        {(scene.also.length > 0 || scene.app) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {scene.also.map((a, i) => (
              <span key={i} className="flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-0.5 text-xs font-semibold">
                <span className="size-2 rounded-full" style={{ background: a.color }} />
                also {a.name}
              </span>
            ))}
            {scene.app && (
              <span className="flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-0.5 text-xs font-semibold">
                <PhoneIcon />
                {scene.app.name} · {span(scene.app.ms)}
              </span>
            )}
          </div>
        )}
      </div>
      <p className="num font-display text-4xl font-bold tracking-tight sm:text-5xl" style={{ color: gap ? "var(--muted)" : scene.color }}>
        {span(Math.max(60_000, p * (scene.end - scene.start)))}
      </p>
    </div>
  );
}

// The day's bar, filling in behind the playhead. Click anywhere on it to jump there.
function Bar({
  placed,
  scenes,
  idx,
  playT,
  from,
  to,
  dayStart,
  tz,
  byId,
  onSeek,
}: {
  placed: ReturnType<typeof layOut>["placed"];
  scenes: Scene[];
  idx: number;
  playT: number;
  from: number;
  to: number;
  dayStart: number;
  tz: string;
  byId: Map<string, { color: string }>;
  onSeek: (t: number) => void;
}) {
  const at = (t: number) => ((t - from) / (to - from)) * 100;
  const fill = (s: number, e: number) => Math.min(1, Math.max(0, (playT - s) / Math.max(1, e - s)));
  const hours = (to - from) / 3_600_000;
  const every = hours > 14 ? 3 : hours > 7 ? 2 : 1;
  const ticks: number[] = [];
  for (let t = dayStart; t <= to; t += every * 3_600_000) if (t >= from) ticks.push(t);
  const cur = scenes[idx];
  return (
    <div className="relative">
      {/* The time where the playhead is. */}
      <div className="pointer-events-none absolute -top-7 z-10 -translate-x-1/2" style={{ left: `${at(playT)}%` }}>
        <span className="num block whitespace-nowrap rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-ink shadow">{clock(new Date(playT), tz)}</span>
      </div>
      <div
        role="slider"
        aria-label="Where in the day"
        aria-valuemin={from}
        aria-valuemax={to}
        aria-valuenow={Math.round(playT)}
        aria-valuetext={clock(new Date(playT), tz)}
        tabIndex={0}
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onSeek(from + ((e.clientX - r.left) / r.width) * (to - from));
        }}
        className="relative h-11 cursor-pointer overflow-hidden rounded-[14px] bg-surface ring-1 ring-line"
      >
        {/* Untracked: striped. */}
        {scenes
          .filter((s) => s.kind === "gap")
          .map((s) => (
            <div
              key={`g-${s.start}`}
              className="absolute inset-y-1 rounded-[9px] bg-[repeating-linear-gradient(135deg,var(--line)_0_6px,transparent_6px_12px)]"
              style={{ left: `${at(s.start)}%`, width: `${at(s.end) - at(s.start)}%` }}
            />
          ))}
        {/* Each entry: a ghost of itself until the playhead reaches it, then filled in. */}
        {placed.map((p) => {
          const color = (p.block.activity_id && byId.get(p.block.activity_id)?.color) || "#a98467";
          const main = p.lane === 0;
          return (
            <div
              key={p.block.id}
              className={`absolute overflow-hidden rounded-[9px] ${main ? "inset-y-1" : "bottom-1 h-2"}`}
              style={{ left: `calc(${at(p.start)}% + 1px)`, width: `max(calc(${at(p.end) - at(p.start)}% - 2px), 3px)`, background: `color-mix(in srgb, ${color} 18%, transparent)` }}
            >
              <div className="h-full" style={{ width: `${fill(p.start, p.end) * 100}%`, background: color }} />
            </div>
          );
        })}
        {/* What's playing, outlined. */}
        {cur && (
          <div
            key={`cur-${idx}`}
            className="reflect-ring pointer-events-none absolute inset-y-0.5 rounded-[11px] ring-2 ring-ink"
            style={{ left: `${at(cur.start)}%`, width: `max(${at(cur.end) - at(cur.start)}%, 10px)` }}
          />
        )}
        <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-ink shadow-[0_0_10px_2px_rgb(0_0_0/0.25)]" style={{ left: `${at(playT)}%` }} />
      </div>
      <div className="relative mt-1 h-4 text-[11px] text-muted">
        {ticks.map((t) => (
          <span key={t} className="num absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${at(t)}%` }}>
            {clock(new Date(t), tz).replace(":00", "").replace(" AM", "a").replace(" PM", "p")}
          </span>
        ))}
      </div>
    </div>
  );
}

// Before it starts: the day's name rising in, a few numbers counting up, and Begin (which starts
// by itself after a few seconds; the ring around it shows when).
function Intro({ title, today, summary, onBegin, count }: { title: string; today: boolean; summary: Summary; onBegin: () => void; count: number }) {
  useEffect(() => {
    const id = setTimeout(onBegin, 7000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once
  }, []);
  const words = title.split(" ");
  return (
    <div className="reflect-fade absolute inset-0 z-30 grid place-items-center bg-[radial-gradient(ellipse_at_50%_35%,rgb(62_40_27/0.72),rgb(29_20_15/0.92))] px-6 text-center text-[#faf6f0] backdrop-blur-sm">
      <div className="max-w-2xl">
        <p className="reflect-word text-base opacity-75" style={{ animationDelay: "100ms" }}>
          {today ? "Let's look back on today," : "Looking back on"}
        </p>
        <h1 className="mt-2 flex flex-wrap justify-center gap-x-[0.28em] font-display text-5xl font-bold tracking-tight sm:text-7xl">
          {words.map((w, i) => (
            <span key={i} className="reflect-word inline-block" style={{ animationDelay: `${300 + i * 160}ms` }}>
              {w}
            </span>
          ))}
        </h1>
        <div className="mt-8 flex flex-wrap justify-center gap-x-10 gap-y-4">
          <Stat label="tracked" delay={900}>
            <CountUp to={summary.tracked / 3_600_000} digits={1} suffix="h" delay={900} />
          </Stat>
          <Stat label={summary.places === 1 ? "place" : "places"} delay={1050}>
            <CountUp to={summary.places} delay={1050} />
          </Stat>
          {summary.miles >= 0.05 && (
            <Stat label="miles" delay={1200}>
              <CountUp to={summary.miles} digits={1} delay={1200} />
            </Stat>
          )}
          <Stat label={count === 1 ? "moment" : "moments"} delay={1350}>
            <CountUp to={count} delay={1350} />
          </Stat>
        </div>
        <button
          type="button"
          onClick={onBegin}
          className="reflect-word group relative mx-auto mt-10 flex items-center gap-3 rounded-full bg-[#faf6f0] py-3 pl-3 pr-6 font-display text-lg font-semibold text-[#2b1c14] shadow-2xl transition-transform hover:scale-[1.03] active:scale-[0.98]"
          style={{ animationDelay: "1600ms" }}
        >
          <span className="relative grid size-10 place-items-center rounded-full bg-[#3e281b] text-[#faf6f0]">
            <svg aria-hidden="true" className="absolute -inset-1 size-12 -rotate-90" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="22" fill="none" stroke="#d4a373" strokeWidth="2.5" strokeLinecap="round" className="reflect-countdown" pathLength={1} />
            </svg>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5.5v13l10.5-6.5z" />
            </svg>
          </span>
          Begin
        </button>
        <p className="reflect-word mt-4 text-xs opacity-55" style={{ animationDelay: "1800ms" }}>
          Space to pause · ← → to step through · Esc when you&rsquo;re done
        </p>
      </div>
    </div>
  );
}

type Summary = { tracked: number; top: { name: string; color: string; ms: number }[]; places: number; miles: number };

// The end: the night sky, where the time went, and goodnight.
function Outro({ name, today, title, summary, onAgain, dayKey }: { name: string | null; today: boolean; title: string; summary: Summary; onAgain: () => void; dayKey: string }) {
  const max = summary.top[0]?.ms ?? 1;
  return (
    <Night fade>
      <div className="relative z-10 mx-auto flex h-full max-w-xl flex-col justify-center px-6 text-[#faf6f0]">
        <div className="reflect-moon mb-6 size-16 rounded-full shadow-[inset_-10px_-6px_0_0_#f1d9a8] sm:size-20" />
        <h1 className="reflect-word font-display text-4xl font-bold tracking-tight sm:text-6xl" style={{ animationDelay: "200ms" }}>
          {today ? `Goodnight${name ? `, ${name}` : ""}.` : `That was ${title.split(",")[0]}.`}
        </h1>
        <p className="reflect-word mt-2 text-base opacity-70" style={{ animationDelay: "400ms" }}>
          {span(summary.tracked)} tracked
          {summary.places ? ` · ${summary.places} ${summary.places === 1 ? "place" : "places"}` : ""}
          {summary.miles >= 0.05 ? ` · ${summary.miles.toFixed(1)} mi` : ""}
        </p>
        {summary.top.length > 0 && (
          <div className="mt-8">
            <p className="reflect-word mb-3 text-sm font-semibold opacity-70" style={{ animationDelay: "600ms" }}>
              Where the time went
            </p>
            <ul className="flex flex-col gap-3">
              {summary.top.map((t, i) => (
                <li key={t.name} className="reflect-word" style={{ animationDelay: `${750 + i * 180}ms` }}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-semibold">{t.name}</span>
                    <span className="num opacity-75">{span(t.ms)}</span>
                  </div>
                  <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-[#faf6f0]/10">
                    <div className="reflect-grow h-full rounded-full" style={{ width: `${(t.ms / max) * 100}%`, background: t.color, animationDelay: `${900 + i * 180}ms` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="reflect-word mt-10 flex flex-wrap gap-3" style={{ animationDelay: "1400ms" }}>
          <button type="button" onClick={onAgain} className="rounded-full bg-[#faf6f0] px-5 py-2.5 text-sm font-semibold text-[#2b1c14] transition-transform hover:scale-[1.03]">
            Watch again
          </button>
          <Link href={`/day?day=${dayKey}`} className="rounded-full px-5 py-2.5 text-sm font-semibold ring-1 ring-[#faf6f0]/30 transition-colors hover:bg-[#faf6f0]/10">
            Back to the day
          </Link>
        </div>
      </div>
    </Night>
  );
}

// Before the evening: the tab's locked. When it opens, and yesterday's in the meantime.
function Locked({ wait, at, prev }: { wait: number; at: string; prev: string }) {
  return (
    <Night>
      <div className="relative z-10 mx-auto flex h-full max-w-md flex-col items-center justify-center px-6 text-center text-[#faf6f0]">
        <div className="reflect-moon mb-6 size-16 rounded-full shadow-[inset_-10px_-6px_0_0_#f1d9a8]" />
        <h1 className="font-display text-3xl font-bold">Reflect opens at {atLabel(at)}</h1>
        <p className="num mt-2 opacity-70">in {span(wait)}. Live the rest of the day first.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href={`/reflect?day=${prev}`} className="rounded-full bg-[#faf6f0] px-5 py-2.5 text-sm font-semibold text-[#2b1c14]">
            Look back on yesterday
          </Link>
          <Link href="/account/reflect" className="rounded-full px-5 py-2.5 text-sm font-semibold ring-1 ring-[#faf6f0]/30 transition-colors hover:bg-[#faf6f0]/10">
            Change the time
          </Link>
        </div>
      </div>
    </Night>
  );
}

// A night sky: deep brown to black, with stars twinkling (the same stars every time).
function Night({ children, fade = false }: { children: ReactNode; fade?: boolean }) {
  const stars = Array.from({ length: 70 }, (_, i) => {
    const r = (n: number) => {
      const x = Math.sin(i * 9301 + n * 49297) * 233280;
      return x - Math.floor(x);
    };
    return { x: r(1) * 100, y: r(2) * 85, s: 1 + r(3) * 2.2, d: r(4) * 4, o: 0.35 + r(5) * 0.6 };
  });
  return (
    <div className={`absolute inset-0 z-30 overflow-hidden bg-[radial-gradient(ellipse_at_70%_0%,#4a3122,#1d140f_55%,#0d0907)] ${fade ? "reflect-fade" : ""}`}>
      {stars.map((s, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="reflect-star absolute rounded-full bg-[#faf6f0]"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, opacity: s.o, animationDelay: `${s.d}s` }}
        />
      ))}
      {children}
    </div>
  );
}

function Stat({ label, delay, children }: { label: string; delay: number; children: ReactNode }) {
  return (
    <div className="reflect-word" style={{ animationDelay: `${delay}ms` }}>
      <p className="num font-display text-4xl font-bold">{children}</p>
      <p className="text-sm opacity-65">{label}</p>
    </div>
  );
}

// A number counting up from 0 (after a delay), easing out as it lands.
function CountUp({ to, digits = 0, suffix = "", delay = 0 }: { to: number; digits?: number; suffix?: string; delay?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now() + delay;
    const tick = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - t0) / 1100));
      setV(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, delay]);
  return (
    <>
      {v.toFixed(digits)}
      {suffix}
    </>
  );
}

function RoundButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="grid size-10 place-items-center rounded-full bg-surface text-ink transition-[transform,background-color] hover:bg-line/70 active:scale-95">
      {children}
    </button>
  );
}

// "Theory → Russell Labs": the stop before a trip and the one after.
function tripWhere(visits: Day["visits"], start: number, end: number, now: number) {
  const nameOf = (v: Day["visits"][number] | undefined) => (v ? (v.place ?? v.auto_name) : null);
  const before = [...visits].filter((v) => +new Date(v.arrived_at) <= start + 5 * 60_000).sort((a, b) => +new Date(b.arrived_at) - +new Date(a.arrived_at))[0];
  const after = visits.filter((v) => +new Date(v.arrived_at) >= start + 60_000 && +new Date(v.arrived_at) <= Math.min(end, now) + 10 * 60_000).sort((a, b) => +new Date(a.arrived_at) - +new Date(b.arrived_at))[0];
  const a = nameOf(before);
  const b = nameOf(after);
  return a && b && a !== b ? `${a} → ${b}` : (b ?? a);
}

// How far you went: along the dots, leaving out time standing still and jumps over missed stretches.
function distance(points: Day["points"]) {
  let m = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.motion === "still" || b.motion === "still") continue;
    if (+new Date(b.at) - +new Date(a.at) > 10 * 60_000) continue;
    const d = metres(a, b);
    if (d < 3000) m += d;
  }
  return m;
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-[#d4a373]">
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}
function PhoneIcon() {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
    </svg>
  );
}
function Chevron({ left = false }: { left?: boolean }) {
  return (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={left ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}
