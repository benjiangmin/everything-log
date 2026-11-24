"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Avatar from "./Avatar";
import { useNow } from "./useNow";
import { clock, dayTitle, span } from "@/mbm/time";
import { answerRequest, cancelRequest, friendRequest, type Profile } from "@/app/mbm/social/actions";

const FriendMap = dynamic(() => import("./FriendMap"), { ssr: false, loading: () => <div className="h-80 animate-pulse rounded-card bg-surface" /> });

// Someone's profile: name and picture, then whatever they share with you: what they're doing,
// their day bar, where the time went, their map (trusted friends), and days they pinned.
export default function FriendProfile({ profile: p, tz, renderedAt }: { profile: Profile; tz: string; renderedAt: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const now = useNow(renderedAt);
  const act = (f: () => Promise<{ ok: true } | { ok: false; message: string }>) =>
    start(async () => {
      const res = await f();
      setMessage(res.ok ? null : res.message);
      router.refresh();
    });
  const nothing = !p.now && !p.bar && !p.stops;

  return (
    <div>
      <p className="text-sm font-semibold text-muted">
        <Link href="/social" className="hover:text-ink">
          Social
        </Link>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <Avatar src={p.avatar} name={p.name} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-3xl font-semibold tracking-tight">{p.name ?? p.username}</h1>
          {p.username && <p className="text-muted">@{p.username}</p>}
        </div>
        {p.relation === "none" && (
          <button type="button" disabled={pending} onClick={() => act(() => friendRequest(p.id))} className="rounded-control bg-accent px-4 py-2 font-semibold text-accent-ink disabled:opacity-50">
            Add friend
          </button>
        )}
        {p.relation === "sent" && (
          <button type="button" disabled={pending} onClick={() => act(() => cancelRequest(p.id))} className="rounded-control px-4 py-2 text-sm font-semibold ring-1 ring-line">
            Requested · cancel
          </button>
        )}
        {p.relation === "received" && (
          <button type="button" disabled={pending} onClick={() => act(() => answerRequest(p.id, true))} className="rounded-control bg-accent px-4 py-2 font-semibold text-accent-ink disabled:opacity-50">
            Accept request
          </button>
        )}
        {p.relation === "friend" && <span className="rounded-full bg-surface px-3 py-1 text-sm font-semibold">Friends{p.trusted ? " · trusted" : ""}</span>}
      </div>
      {message && <p className="mt-3 text-sm text-danger">{message}</p>}

      {/* Which day: today, or one they pinned. */}
      {(p.pinned.length > 0 || !p.today) && (
        <div className="mt-6 flex flex-wrap gap-2">
          <Chip href={`/social/${p.username}`} on={p.today}>
            Today
          </Chip>
          {p.pinned.map((d) => (
            <Chip key={d} href={`/social/${p.username}?day=${d}`} on={p.day === d}>
              {dayTitle(d)}
            </Chip>
          ))}
        </div>
      )}

      {p.now && (
        <section className="mt-6 flex items-center gap-4 rounded-card px-5 py-4 text-white" style={{ background: p.now.color }}>
          <span className="relative flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/70" />
            <span className="relative inline-flex size-3 rounded-full bg-white" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm opacity-80">Doing now</p>
            <p className="truncate text-xl font-semibold">{p.now.name}</p>
          </div>
          <p className="font-semibold tabular-nums">{span(now - +new Date(p.now.since))}</p>
        </section>
      )}

      {p.bar && (
        <Section title={p.today ? "Today" : dayTitle(p.day)}>
          <Bar slices={p.bar} day={p.day} tz={tz} now={p.today ? now : null} />
        </Section>
      )}

      {p.stops && (
        <Section title="On the map">
          <FriendMap stops={p.stops} route={p.route ?? []} tz={tz} />
        </Section>
      )}

      {nothing && (
        <p className="mt-8 rounded-card bg-surface px-5 py-4 text-sm text-muted">
          {p.relation === "friend" ? `${p.name ?? p.username} isn't sharing anything with you yet.` : `Only ${p.name ?? p.username}'s name and picture are shown. Add them as a friend to see more, if they share it.`}
        </p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Chip({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${on ? "bg-ink text-paper" : "ring-1 ring-line hover:bg-surface"}`}>
      {children}
    </Link>
  );
}

// Their day on one bar, midnight to midnight, with a line at "now" (today). Hover it for what it
// was (private jobs say Busy).
function Bar({ slices, day, tz, now }: { slices: Profile["bar"] & object; day: string; tz: string; now: number | null }) {
  const [hover, setHover] = useState<number | null>(null); // where the pointer is: 0 to 1
  const first = slices.length ? Math.min(...slices.map((s) => +new Date(s.start))) : (now ?? 0);
  const dayStart = first ? dayStartOf(first, tz) : 0;
  const total = 24 * 3600_000;
  const pct = (t: number) => (Math.min(total, Math.max(0, t - dayStart)) / total) * 100;
  const at = hover == null ? null : dayStart + hover * total;
  const lit = at == null ? null : (slices.findLast((s) => +new Date(s.start) <= at && at < +new Date(s.end)) ?? null);
  return (
    <div>
      <div
        className="relative h-12 rounded-control bg-surface"
        onPointerMove={(e) => {
          if (e.pointerType !== "mouse") return;
          const r = e.currentTarget.getBoundingClientRect();
          setHover(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <div className="absolute inset-0 overflow-hidden rounded-control">
          {slices.map((s, i) => {
            const a = pct(+new Date(s.start));
            const b = pct(+new Date(s.end));
            if (b <= a) return null;
            return (
              <span
                key={i}
                className={`absolute inset-y-0 border-r border-paper/60 transition-opacity ${lit && lit !== s ? "opacity-45" : ""}`}
                style={{ left: `${a}%`, width: `${b - a}%`, background: s.color }}
              />
            );
          })}
        </div>
        {now != null && <div aria-hidden="true" className="pointer-events-none absolute -inset-y-1 z-10 w-0.5 -translate-x-1/2 rounded-full bg-ink" style={{ left: `${pct(now)}%` }} />}
        {lit && (
          <div
            role="tooltip"
            className="pointer-events-none absolute bottom-full z-20 mb-3 w-max rounded-card bg-accent px-4 py-2.5 text-accent-ink shadow-xl shadow-ink/30"
            style={{ left: `${Math.min(88, Math.max(12, (hover ?? 0) * 100))}%`, transform: "translateX(-50%)" }}
          >
            <p className="flex items-center gap-2 font-display text-base font-semibold">
              <span className="size-2.5 rounded-full ring-1 ring-accent-ink/40" style={{ background: lit.color }} />
              {lit.name}
            </p>
            <p className="num mt-0.5 text-sm opacity-80">
              {clock(lit.start, tz)} – {now != null && +new Date(lit.end) >= now - 60_000 ? "now" : clock(lit.end, tz)} · {span(+new Date(lit.end) - +new Date(lit.start))}
            </p>
          </div>
        )}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>12a</span>
        <span>6a</span>
        <span>12p</span>
        <span>6p</span>
        <span>12a</span>
      </div>
      {slices.length === 0 && <p className="mt-2 text-sm text-muted">Nothing tracked {day ? "this day" : "yet"}.</p>}
    </div>
  );
}

// Midnight (in tz) of the day a moment is in.
function dayStartOf(t: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" }).formatToParts(new Date(t));
  const get = (k: string) => Number(parts.find((x) => x.type === k)?.value ?? 0);
  return t - ((get("hour") * 60 + get("minute")) * 60 + get("second")) * 1000 - (t % 1000);
}
