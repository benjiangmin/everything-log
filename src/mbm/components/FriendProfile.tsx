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
  const nothing = !p.now && !p.bar && !p.stats && !p.stops;

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
          <Bar slices={p.bar} day={p.day} tz={tz} />
        </Section>
      )}

      {p.stats && p.stats.length > 0 && (
        <Section title="Where the time went">
          <ul className="grid gap-2.5">
            {p.stats.slice(0, 12).map((s) => {
              const max = p.stats![0].seconds || 1;
              return (
                <li key={s.name} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                    <span className="truncate font-semibold">{s.name}</span>
                  </span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-surface">
                    <span className="block h-full rounded-full" style={{ width: `${(s.seconds / max) * 100}%`, background: s.color }} />
                  </span>
                  <span className="tabular-nums text-muted">{span(s.seconds * 1000)}</span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {p.stops && (
        <Section title="Where they went">
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

// Their day on one bar, midnight to midnight.
function Bar({ slices, day, tz }: { slices: Profile["bar"] & object; day: string; tz: string }) {
  const first = slices.length ? Math.min(...slices.map((s) => +new Date(s.start))) : 0;
  const dayStart = first ? dayStartOf(first, tz) : 0;
  const total = 24 * 3600_000;
  return (
    <div>
      <div className="relative h-12 overflow-hidden rounded-control bg-surface">
        {slices.map((s, i) => {
          const a = Math.max(0, +new Date(s.start) - dayStart);
          const b = Math.min(total, +new Date(s.end) - dayStart);
          if (b <= a) return null;
          return (
            <span
              key={i}
              title={`${s.name} · ${clock(s.start, tz)} – ${clock(s.end, tz)}`}
              className="absolute inset-y-0 border-r border-paper/60"
              style={{ left: `${(a / total) * 100}%`, width: `${((b - a) / total) * 100}%`, background: s.color }}
            />
          );
        })}
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
