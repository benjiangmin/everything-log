"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Avatar from "./Avatar";
import { useNow } from "./useNow";
import { markSocialSeen, NEWS_DOT, useSocialNews } from "@/mbm/useSocialNews";
import { span } from "@/mbm/time";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  answerRequest, blockUser, cancelRequest, follow, removeFollower, searchPeople, setClose, setUsername, unblockUser, unfollow,
  type Person, type Social,
} from "@/app/mbm/social/actions";

type Done = { ok: true } | { ok: false; message: string };
type Run = (f: () => Promise<Done>) => void;
type Tab = "following" | "followers" | "requests" | "find";


// The Social tab, laid out like a social app: your profile on top (tap it for how it looks; the
// gear: what others see), what people you follow are doing now, then Following / Followers /
// Requests / Find people. Following is one way, and each follower is approved (072).
export default function SocialView({ social, renderedAt }: { social: Social; renderedAt: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(social.incoming.length > 0 ? "requests" : social.following.length === 0 ? "find" : "following");
  const now = useNow(renderedAt);
  // Blue dots: what's new on each tab; opening a tab is seeing it.
  const news = useSocialNews();
  useEffect(() => {
    if (tab !== "find") markSocialSeen(tab);
  }, [tab]);
  const run: Run = (f) =>
    start(async () => {
      const res = await f().catch(() => ({ ok: false as const, message: "That didn't go through. Try again." }));
      setMessage(res.ok ? null : res.message);
      router.refresh();
    });

  const me = social.me;
  const mine = me?.username ? `/social/${me.username}` : "/account/sharing";
  const live = [...social.following].sort((a, b) => Number(!!b.now) - Number(!!a.now));

  return (
    <div>
      {/* You */}
      <section className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-start sm:gap-8 sm:text-left">
        <Link href={mine} aria-label="Your profile" className="rounded-full hover:opacity-90">
          <Ring color={me?.now?.color} size={112}>
            <Avatar src={me?.avatar} name={me?.name ?? me?.username} size={112} />
          </Ring>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-center gap-2 sm:justify-start">
            <h1 className="min-w-0 truncate font-display text-3xl font-semibold tracking-tight">
              <Link href={mine} className="hover:underline">
                {me?.name || me?.username || "You"}
              </Link>
            </h1>
            <Link href="/account/sharing" aria-label="What others see" title="What others see" className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
              </svg>
            </Link>
          </div>
          {me?.username ? <p className="text-muted">@{me.username}</p> : <PickUsername />}
          <dl className="mt-4 flex justify-center gap-8 sm:justify-start">
            <Count n={social.followers.length} label={social.followers.length === 1 ? "follower" : "followers"} onClick={() => setTab("followers")} />
            <Count n={social.following.length} label="following" onClick={() => setTab("following")} />
          </dl>
          {me?.now && <NowPill now={me.now} at={now} className="mt-4" />}
        </div>
      </section>

      {message && (
        <p role="alert" className="mt-4 rounded-control bg-surface px-4 py-2.5 text-sm text-danger">
          {message}
        </p>
      )}

      {/* People you follow, right now, like stories */}
      {live.length > 0 && (
        <section aria-label="People you follow, right now" className="-mx-4 mt-8 overflow-x-auto px-4">
          <ul className="flex gap-5 pb-2">
            {live.map((p) => (
              <li key={p.id} className="w-20 shrink-0">
                <Link href={p.username ? `/social/${p.username}` : "#"} className="group flex flex-col items-center gap-1.5 text-center">
                  <Ring color={p.now?.color} size={68}>
                    <Avatar src={p.avatar} name={p.name} size={68} />
                  </Ring>
                  <span className="w-full truncate text-xs font-semibold group-hover:underline">{first(p)}</span>
                  <span className="-mt-1 w-full truncate text-[11px] text-muted">{p.now ? p.now.name : " "}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Tabs */}
      <nav className="mt-8 flex border-b border-line" role="tablist">
        <TabButton on={tab === "following"} onClick={() => setTab("following")} fresh={news.following}>
          Following
        </TabButton>
        <TabButton on={tab === "followers"} onClick={() => setTab("followers")} fresh={news.followers}>
          Followers
        </TabButton>
        <TabButton on={tab === "requests"} onClick={() => setTab("requests")} badge={social.incoming.length} fresh={news.requests}>
          Requests
        </TabButton>
        <TabButton on={tab === "find"} onClick={() => setTab("find")}>
          Find people
        </TabButton>
      </nav>

      <div className="mt-5">
        {tab === "following" && (
          <>
            {social.following.length === 0 ? (
              <Empty>
                You don&apos;t follow anyone yet.{" "}
                <button type="button" onClick={() => setTab("find")} className="font-semibold text-ink underline underline-offset-2">
                  Find people
                </button>
              </Empty>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {social.following.map((p) => (
                  <FollowingCard key={p.id} person={p} at={now} pending={pending} run={run} />
                ))}
              </ul>
            )}
            {social.blocked.length > 0 && (
              <details className="mt-8 text-sm">
                <summary className="cursor-pointer font-semibold text-muted hover:text-ink">Blocked ({social.blocked.length})</summary>
                <ul className="mt-3 divide-y divide-line rounded-card border border-line">
                  {social.blocked.map((p) => (
                    <Row key={p.id} person={p}>
                      <Btn disabled={pending} onClick={() => run(() => unblockUser(p.id))}>
                        Unblock
                      </Btn>
                    </Row>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}

        {tab === "followers" &&
          (social.followers.length === 0 ? (
            <Empty>No followers yet. When someone asks to follow you, it shows under Requests.</Empty>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">Close friends see your map, if you share it.</p>
              <ul className="divide-y divide-line rounded-card border border-line">
                {social.followers.map((p) => (
                  <FollowerRow key={p.id} person={p} pending={pending} run={run} />
                ))}
              </ul>
            </>
          ))}

        {tab === "requests" && (
          <>
            {social.incoming.length === 0 && social.outgoing.length === 0 && <Empty>No requests right now.</Empty>}
            {social.incoming.length > 0 && (
              <ul className="divide-y divide-line rounded-card border border-line">
                {social.incoming.map((p) => (
                  <Row key={p.id} person={p} sub={p.at ? ago(p.at, now) : undefined}>
                    <Btn primary disabled={pending} onClick={() => run(() => answerRequest(p.id, true))}>
                      Accept
                    </Btn>
                    <Btn disabled={pending} onClick={() => run(() => answerRequest(p.id, false))}>
                      Decline
                    </Btn>
                  </Row>
                ))}
              </ul>
            )}
            {social.outgoing.length > 0 && (
              <>
                <h2 className="mt-8 text-sm font-semibold text-muted">Sent</h2>
                <ul className="mt-2 divide-y divide-line rounded-card border border-line">
                  {social.outgoing.map((p) => (
                    <Row key={p.id} person={p}>
                      <Btn disabled={pending} onClick={() => run(() => cancelRequest(p.id))}>
                        Cancel
                      </Btn>
                    </Row>
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        {tab === "find" && (me?.username ? <Search onAction={run} /> : <Empty>Pick a username above first, so people can find you too.</Empty>)}
      </div>
    </div>
  );
}

// Someone you follow: picture, name, and what they're doing right now (if they share it).
function FollowingCard({ person: p, at, pending, run }: { person: Person; at: number; pending: boolean; run: Run }) {
  const confirm = useConfirm();
  const who = p.name ?? p.username ?? "them";
  return (
    <li className="relative flex items-center gap-3 rounded-card border border-line p-3 pr-2 transition-colors hover:bg-surface/50">
      <Link href={p.username ? `/social/${p.username}` : "#"} className="flex min-w-0 flex-1 items-center gap-3">
        <Ring color={p.now?.color} size={52}>
          <Avatar src={p.avatar} name={p.name} size={52} />
        </Ring>
        <span className="min-w-0">
          <span className="block truncate font-semibold">{who}</span>
          {p.now ? <NowPill now={p.now} at={at} small /> : <span className="block truncate text-sm text-muted">{p.username ? `@${p.username}` : ""}</span>}
        </span>
      </Link>
      <Menu label={`Options for ${who}`}>
        <MenuItem
          disabled={pending}
          onClick={async () => {
            if (await confirm({ title: `Unfollow ${who}?`, body: "They won't be told. To follow again, you'd ask again.", confirmLabel: "Unfollow" })) run(() => unfollow(p.id));
          }}
        >
          Unfollow
        </MenuItem>
        <BlockItem who={who} id={p.id} pending={pending} run={run} />
      </Menu>
    </li>
  );
}

// Someone who follows you: follow them back, put them on close friends, or remove them.
function FollowerRow({ person: p, pending, run }: { person: Person; pending: boolean; run: Run }) {
  const confirm = useConfirm();
  const who = p.name ?? p.username ?? "them";
  return (
    <Row person={p} href={p.username ? `/social/${p.username}` : undefined} badge={p.close ? "Close friend" : undefined}>
      <FollowButton person={p} onAction={run} />
      <Menu label={`Options for ${who}`}>
        <MenuItem disabled={pending} onClick={() => run(() => setClose(p.id, !p.close))}>
          {p.close ? "Remove from close friends" : "Add to close friends"}
          <span className="block text-xs font-normal text-muted">Close friends see your map, if you share it</span>
        </MenuItem>
        <MenuItem
          disabled={pending}
          onClick={async () => {
            if (await confirm({ title: `Remove ${who}?`, body: "They stop following you. They won't be told.", confirmLabel: "Remove" })) run(() => removeFollower(p.id));
          }}
        >
          Remove follower
        </MenuItem>
        <BlockItem who={who} id={p.id} pending={pending} run={run} />
      </Menu>
    </Row>
  );
}

function BlockItem({ who, id, pending, run }: { who: string; id: string; pending: boolean; run: Run }) {
  const confirm = useConfirm();
  return (
    <MenuItem
      danger
      disabled={pending}
      onClick={async () => {
        if (await confirm({ title: `Block ${who}?`, body: "Neither of you follows the other anymore, and you can't find each other.", confirmLabel: "Block" })) run(() => blockUser(id));
      }}
    >
      Block
    </MenuItem>
  );
}

// Follow / Follow back / Requested (tap to take it back) / Following.
function FollowButton({ person: p, onAction, onDone }: { person: Person; onAction: Run; onDone?: (change: Partial<Person>) => void }) {
  if (p.relation === "self") return null;
  if (p.following) return <span className="px-2 text-sm text-muted">Following</span>;
  if (p.requested)
    return (
      <Btn onClick={() => onAction(async () => { const r = await cancelRequest(p.id); onDone?.({ requested: false }); return r; })}>
        Requested
      </Btn>
    );
  return (
    <Btn primary onClick={() => onAction(async () => { const r = await follow(p.id); markSocialSeen("following"); onDone?.({ requested: true }); return r; })}>
      {p.follows_me ? "Follow back" : "Follow"}
    </Btn>
  );
}

// A picture with a ring in the colour of what they're doing now (none when idle or not shared).
function Ring({ color, size, children }: { color?: string | null; size: number; children: ReactNode }) {
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full"
      style={{ width: size + 10, height: size + 10, background: color ?? "transparent", boxShadow: color ? undefined : "inset 0 0 0 1px var(--line)" }}
    >
      <span className="grid place-items-center rounded-full bg-paper" style={{ width: size + 4, height: size + 4 }}>
        {children}
      </span>
    </span>
  );
}

function NowPill({ now, at, small, className = "" }: { now: { name: string; color: string; since: string }; at: number; small?: boolean; className?: string }) {
  return (
    <span className={`flex min-w-0 items-center gap-1.5 ${small ? "text-sm" : "justify-center text-sm sm:justify-start"} ${className}`}>
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: now.color }} />
      <span className="truncate font-semibold">{now.name}</span>
      <span className="shrink-0 tabular-nums text-muted">{span(Math.max(0, at - new Date(now.since).getTime()))}</span>
    </span>
  );
}

function Count({ n, label, onClick }: { n: number; label: string; onClick?: () => void }) {
  const inner = (
    <>
      <dd className="font-display text-xl font-semibold tabular-nums">{n}</dd>
      <dt className="text-sm text-muted">{label}</dt>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="flex flex-col items-center rounded-control hover:opacity-70 sm:items-start">
      {inner}
    </button>
  ) : (
    <div className="flex flex-col items-center sm:items-start">{inner}</div>
  );
}

function TabButton({ on, onClick, badge, fresh, children }: { on: boolean; onClick: () => void; badge?: number; fresh?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={`-mb-px flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${
        on ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
      }`}
    >
      {children}
      {fresh && !on && !badge && <span aria-label="Something new" className={NEWS_DOT} />}
      {!!badge && (
        <span className={`grid min-w-5 place-items-center rounded-full px-1.5 text-[11px] leading-5 ${fresh && !on ? "bg-[#3b82f6] text-white" : "bg-accent text-accent-ink"}`}>{badge}</span>
      )}
    </button>
  );
}

function Menu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div ref={box} className="relative shrink-0">
      <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink">
        <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden="true">
          <circle cx="4" cy="10" r="1.6" />
          <circle cx="10" cy="10" r="1.6" />
          <circle cx="16" cy="10" r="1.6" />
        </svg>
      </button>
      {open && (
        <div role="menu" onClick={() => setOpen(false)} className="absolute right-0 top-10 z-20 w-60 overflow-hidden rounded-card border border-line bg-paper py-1 shadow-lg">
          {children}
        </div>
      )}
    </div>
  );
}

function MenuItem({ children, onClick, danger, disabled }: { children: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button type="button" role="menuitem" disabled={disabled} onClick={onClick} className={`block w-full px-4 py-2.5 text-left text-sm font-semibold hover:bg-surface disabled:opacity-50 ${danger ? "text-danger" : ""}`}>
      {children}
    </button>
  );
}

// Before anything else: a username, so people can find you.
function PickUsername() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="mt-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await setUsername(name);
          if (!res.ok) return setMessage(res.message);
          router.refresh();
        });
      }}
    >
      <div className="flex justify-center gap-2 sm:justify-start">
        <span className="flex w-56 items-center rounded-control border border-line bg-paper px-3 focus-within:border-ink">
          <span className="text-muted">@</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="pick a username" aria-label="Username" className="w-full bg-transparent py-2 pl-1" style={{ outline: "none" }} />
        </span>
        <button type="submit" disabled={pending || name.trim().length < 3} className="rounded-control bg-accent px-4 text-sm font-semibold text-accent-ink disabled:opacity-40">
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-muted">{message ?? "It's how friends find you. 3 to 20 letters, numbers, dots or underscores."}</p>
    </form>
  );
}

// Find people by @username or name.
function Search({ onAction }: { onAction: Run }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Person[] | null>(null);
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) return;
    let live = true;
    const t = setTimeout(() => searchPeople(text).then((r) => live && setFound(r)), 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);
  const shown = q.trim().length < 2 ? null : found;
  return (
    <section>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
        placeholder="Search by @username or name"
        aria-label="Find people"
        className="w-full rounded-full border border-line bg-surface/60 px-5 py-3 focus:border-ink focus:bg-paper [&::-webkit-search-cancel-button]:hidden"
        style={{ outline: "none" }}
      />
      {shown && (
        <ul className="mt-3 divide-y divide-line rounded-card border border-line">
          {shown.length === 0 && <li className="px-5 py-4 text-sm text-muted">Nobody found.</li>}
          {shown.map((p) => (
            <Row key={p.id} person={p} href={p.username ? `/social/${p.username}` : undefined}>
              <FollowButton person={p} onAction={onAction} onDone={(change) => setFound((f) => f?.map((x) => (x.id === p.id ? { ...x, ...change } : x)) ?? f)} />
            </Row>
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({ person, href, sub, badge, children }: { person: Person; href?: string; sub?: string; badge?: string; children?: ReactNode }) {
  const who = (
    <span className="flex min-w-[11rem] flex-1 items-center gap-3">
      <Avatar src={person.avatar} name={person.name} size={44} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-semibold">{person.name ?? person.username}</span>
          {badge && <span className="shrink-0 rounded-full bg-surface px-1.5 text-[11px] font-semibold text-muted">{badge}</span>}
        </span>
        <span className="block truncate text-sm text-muted">
          {person.username && `@${person.username}`}
          {sub && ` · ${sub}`}
        </span>
      </span>
    </span>
  );
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      {href ? (
        <Link href={href} className="flex min-w-[11rem] flex-1 items-center rounded-control hover:opacity-80">
          {who}
        </Link>
      ) : (
        who
      )}
      <span className="ml-auto flex items-center gap-2">{children}</span>
    </li>
  );
}

function Btn({ children, onClick, primary, disabled }: { children: ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-control px-4 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50 ${primary ? "bg-accent text-accent-ink hover:opacity-90" : "bg-surface hover:bg-line"}`}
    >
      {children}
    </button>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-card bg-surface/60 px-5 py-8 text-center text-sm text-muted">{children}</p>;
}

const first = (p: Person) => (p.name ?? p.username ?? "").split(" ")[0];

function ago(iso: string, at: number) {
  const mins = Math.max(0, Math.round((at - new Date(iso).getTime()) / 60000));
  if (mins < 60) return mins <= 1 ? "just now" : `${mins}m ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}
