"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { keepGoingOn, nudges, rightNowPicks, setPinnedJobs, stopEntry } from "@/app/mbm/actions";
import type { Pick } from "@/mbm/smart";
import type { Nudge } from "@/mbm/smart";
import type { Activity, Block, Day } from "@/mbm/data";
import { clock, span } from "@/mbm/time";
import { undo, undoable } from "@/mbm/undo";
import { isMoving } from "@/mbm/moving";
import { openMbm } from "./open";
import { useSeconds } from "./useSeconds";

// Home's "Right now", in the phone app's spirit: what's running as a big card in its own color
// (a ticking stopwatch and a round Stop), or a "Start something" card when nothing is; then your
// usual jobs as tiles and the best guesses for right now as rows. Every start opens the side
// panel (filled in), where you say when it started.
export default function MbmHome({ day, renderedAt, pins }: { day: Day; renderedAt: number; pins: string[] }) {
  const router = useRouter();
  const byId = new Map(day.activities.map((a) => [a.id, a]));
  const running = day.running;
  const [first, ...more] = running;
  const [stopping, runStop] = useTransition();
  const [stopped, setStopped] = useState<{ name: string; ms: number; color: string } | null>(null);
  // (AI suggestions: a word about something that's been going a while. Gone once answered.)
  const [nudge, setNudge] = useState<Nudge[]>([]);
  // "Right now?": the same 3 as the phone's (src/mbm/smart.ts rightNow). Placeholders until
  // they're in, so nothing flashes and changes.
  const [picks, setPicks] = useState<Pick[] | null>(null);
  const [pinned, setPinned] = useState<string[]>(pins);
  const [pinPicking, setPinPicking] = useState(false);
  const runningKey = running.map((b) => b.activity_id).join(",");
  const pinsKey = pinned.join(",");
  useEffect(() => {
    let live = true;
    rightNowPicks()
      .then((p) => live && setPicks(p))
      .catch(() => live && setPicks([]));
    return () => {
      live = false;
    };
  }, [runningKey, pinsKey]);
  const pin = (id: string, on: boolean) => {
    const next = on ? [...pinned.filter((x) => x !== id), id] : pinned.filter((x) => x !== id);
    setPinned(next);
    void setPinnedJobs(next);
  };

  useEffect(() => {
    let live = true;
    nudges()
      .then((n) => live && setNudge(n))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  // The "logged" note goes by itself after a while.
  useEffect(() => {
    if (!stopped) return;
    const id = setTimeout(() => setStopped(null), 6000);
    return () => clearTimeout(id);
  }, [stopped]);

  const stop = (b: Block) =>
    runStop(async () => {
      const a = b.activity_id ? byId.get(b.activity_id) : undefined;
      const res = await undoable(day.dayKey, "Stop", () => stopEntry(b.id));
      if (res.ok) setStopped({ name: a?.name ?? "Something", ms: Date.now() - +new Date(b.started_at), color: a?.color ?? "#a98467" });
    });

  const start = (name?: string) => openMbm({ kind: "now", switch: running.length > 0, name });

  const runningIds = new Set(running.map((b) => b.activity_id));
  // Pinned (yours, the same on the phone): up to 6, not what's running.
  const pinnedJobs = pinned.map((id) => byId.get(id)).filter((a): a is Activity => !!a && !runningIds.has(a.id)).slice(0, 6);
  const rightNow = (picks ?? []).filter((p) => !runningIds.has(p.activity_id) && !pinned.includes(p.activity_id));

  return (
    <section aria-label="Right now" className="mt-8 flex flex-col gap-6">
      <div className={`flex flex-col gap-3 transition-opacity ${stopping ? "opacity-70" : ""}`}>
        {first ? (
          <Hero block={first} activity={first.activity_id ? byId.get(first.activity_id) : undefined} tz={day.tz} renderedAt={renderedAt} busy={stopping} onStop={() => stop(first)} />
        ) : (
          <Idle onClick={() => start()} />
        )}
        {nudge
          .filter((n) => running.some((b) => b.id === n.block_id))
          .map((n) => (
            <div key={n.block_id} role="status" className="home-pop flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[18px] bg-surface px-4 py-3 ring-1 ring-line">
              <p className="min-w-0 flex-1 text-sm text-ink">{n.message}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNudge((x) => x.filter((y) => y.block_id !== n.block_id));
                    void keepGoingOn(n.block_id);
                  }}
                  className="rounded-full px-3 py-1.5 text-sm font-semibold text-muted transition-colors hover:bg-line/60 hover:text-ink"
                >
                  Keep going
                </button>
                <button
                  type="button"
                  disabled={stopping}
                  onClick={() => {
                    const b = running.find((x) => x.id === n.block_id);
                    setNudge((x) => x.filter((y) => y.block_id !== n.block_id));
                    if (b) stop(b);
                  }}
                  className="rounded-full bg-accent px-3.5 py-1.5 text-sm font-semibold text-accent-ink transition-opacity hover:opacity-90"
                >
                  Stop {n.name}
                </button>
              </div>
            </div>
          ))}
        {/* More than one thing going on: the others, smaller, each with its own Stop. */}
        {more.map((b) => {
          const a = b.activity_id ? byId.get(b.activity_id) : undefined;
          return <Also key={b.id} block={b} activity={a} renderedAt={renderedAt} busy={stopping} onStop={() => stop(b)} />;
        })}
        {first && (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => openMbm({ kind: "now" })}
              className="flex h-14 items-center justify-center gap-2 rounded-[18px] bg-surface font-display font-semibold text-ink ring-1 ring-line transition-[transform,background-color] hover:bg-line/60 active:scale-[0.98]"
            >
              <Plus /> Start alongside
            </button>
            <button
              type="button"
              onClick={() => openMbm({ kind: "now", switch: true })}
              className="flex h-14 items-center justify-center gap-2 rounded-[18px] bg-accent font-display font-semibold text-accent-ink shadow-lg shadow-accent/25 transition-[transform,opacity] hover:opacity-95 active:scale-[0.98]"
            >
              <SwitchIcon /> Switch
            </button>
          </div>
        )}
      </div>

      <div>
        <Heading>Pinned</Heading>
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {pinnedJobs.map((a, i) => (
            <li key={a.id} className="home-pop group relative" style={{ animationDelay: `${i * 40}ms` }}>
              <button
                type="button"
                onClick={() => start(a.name)}
                title={running.length ? `Switch to ${a.name}` : `Start ${a.name}`}
                className="flex h-full w-full min-w-0 flex-col items-center gap-2 rounded-[22px] bg-surface px-3 pb-2.5 pt-3.5 transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-line/60 active:scale-[0.97]"
              >
                <Badge activity={a} />
                <span className="line-clamp-2 h-8 w-full break-words text-center text-xs font-semibold leading-tight text-ink">{a.name}</span>
              </button>
              <button
                type="button"
                onClick={() => pin(a.id, false)}
                aria-label={`Unpin ${a.name}`}
                title="Unpin"
                className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-paper text-muted opacity-0 shadow-sm transition-opacity hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
              >
                <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </li>
          ))}
          {pinned.length < 6 && (
            <li className="relative">
              <button
                type="button"
                onClick={() => setPinPicking((x) => !x)}
                aria-label="Pin a job"
                className="grid h-full min-h-[112px] w-full place-items-center rounded-[22px] border-2 border-dashed border-line text-muted transition-colors hover:border-muted hover:text-ink"
              >
                <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
              {pinPicking && (
                <PinPicker
                  jobs={day.activities.filter((a) => !pinned.includes(a.id) && !isMoving(a.name))}
                  onPick={(id) => {
                    pin(id, true);
                    setPinPicking(false);
                  }}
                  onClose={() => setPinPicking(false)}
                />
              )}
            </li>
          )}
        </ul>
      </div>

      {picks === null ? (
        <div aria-hidden="true">
          <Heading>Right now?</Heading>
          <ul className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-14 animate-pulse rounded-[18px] bg-surface motion-reduce:animate-none" />
            ))}
          </ul>
        </div>
      ) : (
        rightNow.length > 0 && (
          <div>
            <Heading>Right now?</Heading>
            <ul className="flex flex-col gap-2">
              {rightNow.map((g, i) => (
                <li key={g.activity_id} className="home-pop" style={{ animationDelay: `${i * 40}ms` }}>
                  <button
                    type="button"
                    onClick={() => start(g.name)}
                    className="flex min-h-14 w-full items-center gap-3.5 rounded-[18px] bg-surface px-3.5 py-2.5 text-left transition-[transform,background-color] hover:bg-line/60 active:scale-[0.99]"
                  >
                    <Badge activity={{ name: g.name, color: g.color }} small />
                    <span className="min-w-0 flex-1 truncate font-display font-semibold text-ink">{g.name}</span>
                    <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-paper text-ink">
                      <Play />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      )}

      {/* Just stopped: how long it was, with Undo (like the phone's). */}
      {stopped && (
        <div role="status" className="home-toast fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-accent py-2.5 pl-3 pr-2 text-accent-ink shadow-2xl shadow-ink/30">
          <span aria-hidden="true" className="grid size-7 place-items-center rounded-full" style={{ background: stopped.color }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
          </span>
          <span className="text-sm">
            <span className="font-semibold">{stopped.name}</span>
            <span className="opacity-75"> · {span(stopped.ms)} logged</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setStopped(null);
              void undo().then(() => router.refresh());
            }}
            className="rounded-full bg-accent-ink/15 px-3 py-1 text-sm font-semibold transition-colors hover:bg-accent-ink/25"
          >
            Undo
          </button>
        </div>
      )}
    </section>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2.5 px-1 font-display text-base font-semibold text-ink">{children}</h2>;
}

// What's running: its color, its first letter, a ticking stopwatch and a big round Stop.
function Hero({ block, activity, tz, renderedAt, busy, onStop }: { block: Block; activity?: Activity; tz: string; renderedAt: number; busy: boolean; onStop: () => void }) {
  const now = useSeconds(renderedAt);
  const color = activity?.color ?? "#a98467";
  const light = isLight(color);
  const fg = light ? "#2b1c14" : "#fff";
  const name = activity?.name ?? "Something";
  return (
    <div
      className="home-rise relative overflow-hidden rounded-[28px] p-5 sm:p-6"
      style={{ background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 78%, #000 8%))`, color: fg, boxShadow: `0 18px 40px -16px color-mix(in srgb, ${color} 70%, transparent)` }}
    >
      {/* A slow glow drifting across, so it feels alive. */}
      <span aria-hidden="true" className="home-sheen pointer-events-none absolute -inset-1/2" />
      <div className="relative flex items-center gap-3">
        <span className="relative grid size-12 shrink-0 place-items-center rounded-full font-display text-xl font-bold" style={{ background: light ? "rgb(43 28 20 / 0.12)" : "rgb(255 255 255 / 0.18)" }}>
          <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full opacity-20 motion-reduce:animate-none" style={{ background: fg, animationDuration: "2.4s" }} />
          {initial(name)}
        </span>
        <p className="min-w-0 flex-1 font-display text-2xl font-bold leading-tight">{name}</p>
      </div>
      <div className="relative mt-4 flex items-end justify-between gap-4">
        <div>
          <p className="num font-display text-5xl font-bold tracking-tight sm:text-6xl">{stopwatch(now - +new Date(block.started_at))}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold opacity-80">
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            since {clock(block.started_at, tz)}
            {block.note && <span className="ml-1 truncate font-normal italic opacity-80">{block.note}</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={onStop}
          disabled={busy}
          aria-label={`Stop ${name}`}
          title={`Stop ${name}`}
          className="grid size-[66px] shrink-0 place-items-center rounded-full bg-white shadow-lg shadow-black/15 transition-transform hover:scale-105 active:scale-95 disabled:opacity-70"
        >
          <span className="size-5 rounded-[5px]" style={{ background: color }} />
        </button>
      </div>
    </div>
  );
}

// Another thing going on at the same time: a slim row in its color.
function Also({ block, activity, renderedAt, busy, onStop }: { block: Block; activity?: Activity; renderedAt: number; busy: boolean; onStop: () => void }) {
  const now = useSeconds(renderedAt);
  const color = activity?.color ?? "#a98467";
  return (
    <div className="flex items-center gap-3 rounded-[18px] bg-surface py-2.5 pl-3 pr-2.5 ring-1 ring-line">
      <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ background: color }} />
      <span className="min-w-0 flex-1 truncate font-display font-semibold">{activity?.name ?? "Something"}</span>
      <span className="num text-sm text-muted">{stopwatch(now - +new Date(block.started_at))}</span>
      <button
        type="button"
        onClick={onStop}
        disabled={busy}
        aria-label={`Stop ${activity?.name ?? "it"}`}
        className="grid size-9 place-items-center rounded-full bg-paper shadow-sm ring-1 ring-line transition-transform hover:scale-105 active:scale-95"
      >
        <span className="size-3 rounded-[3px]" style={{ background: color }} />
      </button>
    </div>
  );
}

// Nothing running: a dark card with a breathing "+".
function Idle({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="home-rise flex items-center gap-4 rounded-[28px] bg-accent p-[18px] text-left text-accent-ink shadow-xl shadow-accent/30 transition-transform active:scale-[0.99]"
    >
      <span className="relative grid size-16 shrink-0 place-items-center">
        <span aria-hidden="true" className="home-breathe absolute inset-0 rounded-full bg-accent-ink/15" />
        <span className="relative grid size-12 place-items-center rounded-full bg-accent-ink text-accent">
          <Plus big />
        </span>
      </span>
      <span>
        <span className="block font-display text-xl font-bold">Start something</span>
        <span className="block text-sm opacity-70">Nothing&rsquo;s running right now</span>
      </span>
    </button>
  );
}

// A job's tile picture: its first letter in its color, on a soft square of the same.
function Badge({ activity, small = false }: { activity: { name: string; color: string }; small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center font-display font-bold ${small ? "size-10 rounded-[12px] text-base" : "size-[50px] rounded-[15px] text-xl"}`}
      style={{ background: `color-mix(in srgb, ${activity.color} 16%, transparent)`, color: activity.color }}
    >
      {initial(activity.name)}
    </span>
  );
}

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || "?";

// 1:05:09, or 4:09 under an hour.
function stopwatch(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

// Light enough that dark text reads better on it.
function isLight(hex: string) {
  const h = hex.replace("#", "");
  if (h.length < 6) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.62;
}

function Plus({ big = false }: { big?: boolean }) {
  const s = big ? 22 : 15;
  return (
    <svg aria-hidden="true" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function SwitchIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" />
    </svg>
  );
}
function Play() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.5v13l10.5-6.5z" />
    </svg>
  );
}

// The pinned "+": pick a job to pin (search as you type).
function PinPicker({ jobs, onPick, onClose }: { jobs: Activity[]; onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const shown = jobs.filter((a) => a.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 30);
  return (
    <div className="absolute left-0 top-full z-30 mt-2 w-64 rounded-[16px] bg-paper p-2 shadow-xl ring-1 ring-line">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        placeholder="Pin a job…"
        className="w-full rounded-[10px] bg-surface px-3 py-2 text-sm outline-none ring-1 ring-line focus:ring-muted"
      />
      <ul className="mt-1 max-h-64 overflow-y-auto">
        {shown.map((a) => (
          <li key={a.id}>
            <button type="button" onClick={() => onPick(a.id)} className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-sm hover:bg-surface">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: a.color }} />
              <span className="truncate">{a.name}</span>
            </button>
          </li>
        ))}
        {!shown.length && <li className="px-2.5 py-2 text-sm text-muted">No job by that name.</li>}
      </ul>
    </div>
  );
}
