"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Avatar from "./Avatar";
import { useNow } from "./useNow";
import { dayRange, dayTitle, span } from "@/mbm/time";
import DayBar from "./DayBar";
import { layOut } from "./segments";
import type { Activity, Block } from "@/mbm/data";
import { answerRequest, cancelRequest, follow, unfollow, type Profile } from "@/app/mbm/social/actions";

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
      <div className="mt-4 flex flex-wrap items-center gap-5">
        <Avatar src={p.avatar} name={p.name} size={88} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-3xl font-semibold tracking-tight">{p.name ?? p.username}</h1>
          <p className="flex flex-wrap items-center gap-2 text-muted">
            {p.username && <span>@{p.username}</span>}
            {p.follows_me && p.relation !== "self" && <span className="rounded-full bg-surface px-2 text-xs font-semibold">Follows you</span>}
            {p.close && <span className="rounded-full bg-surface px-2 text-xs font-semibold">Close friend</span>}
          </p>
          <p className="mt-2 flex gap-5 text-sm">
            <span>
              <b className="font-display text-base tabular-nums">{p.followers ?? 0}</b> <span className="text-muted">{p.followers === 1 ? "follower" : "followers"}</span>
            </span>
            <span>
              <b className="font-display text-base tabular-nums">{p.following_count ?? 0}</b> <span className="text-muted">following</span>
            </span>
          </p>
        </div>
        {p.relation !== "self" && (
          <div className="flex flex-wrap gap-2">
            {p.requested_me && (
              <>
                <button type="button" disabled={pending} onClick={() => act(() => answerRequest(p.id, true))} className="rounded-control bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50">
                  Accept request
                </button>
                <button type="button" disabled={pending} onClick={() => act(() => answerRequest(p.id, false))} className="rounded-control bg-surface px-4 py-2 text-sm font-semibold hover:bg-line disabled:opacity-50">
                  Decline
                </button>
              </>
            )}
            {p.following ? (
              <button type="button" disabled={pending} onClick={() => act(() => unfollow(p.id))} className="group rounded-control bg-surface px-4 py-2 text-sm font-semibold hover:bg-line disabled:opacity-50">
                <span className="group-hover:hidden">Following</span>
                <span className="hidden group-hover:inline">Unfollow</span>
              </button>
            ) : p.requested ? (
              <button type="button" disabled={pending} onClick={() => act(() => cancelRequest(p.id))} className="rounded-control bg-surface px-4 py-2 text-sm font-semibold hover:bg-line disabled:opacity-50">
                Requested
              </button>
            ) : (
              <button type="button" disabled={pending} onClick={() => act(() => follow(p.id))} className="rounded-control bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50">
                {p.follows_me ? "Follow back" : "Follow"}
              </button>
            )}
          </div>
        )}
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

      {(p.bar || p.stops) && (
        <Section title={p.today ? "Today" : dayTitle(p.day)}>
          {p.bar && <FriendBar slices={p.bar} day={p.day} tz={tz} now={p.today ? now : dayRange(p.day, tz).end.getTime()} />}
          {p.stops && (
            <div className={p.bar ? "mt-4" : ""}>
              <FriendMap stops={p.stops} route={p.route ?? []} tz={tz} {...asBlocks(p.bar ?? [])} />
            </div>
          )}
        </Section>
      )}

      {nothing && (
        <p className="mt-8 rounded-card bg-surface px-5 py-4 text-sm text-muted">
          {p.relation === "self"
            ? "You're not sharing anything yet. Pick what others see with the gear on Social."
            : p.following
              ? `${p.name ?? p.username} isn't sharing anything with you yet.`
              : `Only ${p.name ?? p.username}'s name and picture are shown. Follow them to see more, if they share it.`}
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

// Their day as entries, the shape the Day page's bar and map take (one job per name and color).
function asBlocks(slices: NonNullable<Profile["bar"]>): { blocks: Block[]; activities: Activity[] } {
  const activities = new Map<string, Activity>();
  const blocks = slices.map((s, i) => {
    const id = `${s.name}|${s.color}`;
    if (!activities.has(id)) activities.set(id, { id, name: s.name, color: s.color, last_used_at: "" });
    return { id: `slice-${i}`, started_at: s.start, ended_at: s.end, activity_id: id, note: null, source: "manual" as const, confirmed: true };
  });
  return { blocks, activities: [...activities.values()] };
}

// Their day bar: the same as the Day page's (hover for what each part was, pinch or ⌘/Ctrl+scroll
// to zoom, drag to move along), just to look at.
function FriendBar({ slices, day, tz, now }: { slices: NonNullable<Profile["bar"]>; day: string; tz: string; now: number }) {
  const { start, end } = dayRange(day, tz);
  const dayStart = start.getTime();
  const dayEnd = end.getTime();
  const { blocks, activities } = asBlocks(slices);
  const { placed, gaps } = layOut(blocks, dayStart, dayEnd, now);
  const lanes = Math.max(1, ...placed.map((x) => x.lane + 1));
  return <DayBar placed={placed} lanes={lanes} gaps={gaps} dayKey={day} dayStart={dayStart} dayEnd={dayEnd} now={now} tz={tz} byId={new Map(activities.map((a) => [a.id, a]))} />;
}

