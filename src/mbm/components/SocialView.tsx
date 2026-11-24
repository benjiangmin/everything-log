"use client";

import Link from "next/link";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Avatar from "./Avatar";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  answerRequest, blockUser, cancelRequest, friendRequest, searchPeople, setTrusted, setUsername, unblockUser, unfriend,
  type Person, type Social,
} from "@/app/mbm/social/actions";

// The Social tab: your username, finding people, requests, friends (trusted ones see your map,
// if you share it), and who you've blocked. What others see is set in Your account.
export default function SocialView({ social }: { social: Social }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const confirm = useConfirm();
  const run = (f: () => Promise<{ ok: true } | { ok: false; message: string }>) =>
    start(async () => {
      const res = await f().catch(() => ({ ok: false as const, message: "That didn't go through. Try again." }));
      setMessage(res.ok ? null : res.message);
      router.refresh();
    });

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Social</h1>
      <p className="mt-2 text-muted">
        Find friends and see what they share. You pick what others see of you in{" "}
        <Link href="/account#social" className="font-semibold text-ink underline underline-offset-2">
          Your account
        </Link>
        .
      </p>
      {message && (
        <p role="alert" className="mt-4 rounded-control bg-surface px-4 py-2.5 text-sm text-danger">
          {message}
        </p>
      )}

      {!social.me?.username ? <PickUsername /> : <Search onAction={run} />}

      {social.incoming.length > 0 && (
        <Group title="Friend requests" count={social.incoming.length}>
          {social.incoming.map((p) => (
            <Row key={p.id} person={p}>
              <Btn primary disabled={pending} onClick={() => run(() => answerRequest(p.id, true))}>
                Accept
              </Btn>
              <Btn disabled={pending} onClick={() => run(() => answerRequest(p.id, false))}>
                Decline
              </Btn>
            </Row>
          ))}
        </Group>
      )}

      <Group title="Friends" count={social.friends.length} empty="No friends yet. Search for someone above.">
        {social.friends.map((p) => (
          <Row key={p.id} person={p} href={p.username ? `/social/${p.username}` : undefined}>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted" title="Trusted friends see your map (if you share it)">
              <input type="checkbox" checked={!!p.trusted} disabled={pending} onChange={(e) => run(() => setTrusted(p.id, e.target.checked))} className="size-4 accent-[var(--accent)]" />
              Trusted
            </label>
            <Btn
              disabled={pending}
              onClick={async () => {
                if (await confirm({ title: `Unfriend ${p.name ?? p.username}?`, body: "They won't be told. You can add them again later.", confirmLabel: "Unfriend" })) run(() => unfriend(p.id));
              }}
            >
              Unfriend
            </Btn>
            <Btn
              danger
              disabled={pending}
              onClick={async () => {
                if (await confirm({ title: `Block ${p.name ?? p.username}?`, body: "You stop being friends, and neither of you can find the other.", confirmLabel: "Block" })) run(() => blockUser(p.id));
              }}
            >
              Block
            </Btn>
          </Row>
        ))}
      </Group>

      {social.outgoing.length > 0 && (
        <Group title="Sent" count={social.outgoing.length}>
          {social.outgoing.map((p) => (
            <Row key={p.id} person={p}>
              <Btn disabled={pending} onClick={() => run(() => cancelRequest(p.id))}>
                Cancel
              </Btn>
            </Row>
          ))}
        </Group>
      )}

      {social.blocked.length > 0 && (
        <Group title="Blocked" count={social.blocked.length}>
          {social.blocked.map((p) => (
            <Row key={p.id} person={p}>
              <Btn disabled={pending} onClick={() => run(() => unblockUser(p.id))}>
                Unblock
              </Btn>
            </Row>
          ))}
        </Group>
      )}
    </div>
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
      className="mt-8 rounded-card border border-line p-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await setUsername(name);
          if (!res.ok) return setMessage(res.message);
          router.refresh();
        });
      }}
    >
      <p className="font-semibold">Pick a username</p>
      <p className="mt-1 text-sm text-muted">It&apos;s how friends find you. 3 to 20 letters, numbers, dots or underscores.</p>
      <div className="mt-3 flex gap-2">
        <span className="flex flex-1 items-center rounded-control border border-line bg-paper px-3 focus-within:border-ink">
          <span className="text-muted">@</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="yourname" className="w-full bg-transparent py-2.5 pl-1" style={{ outline: "none" }} />
        </span>
        <button type="submit" disabled={pending || name.trim().length < 3} className="rounded-control bg-accent px-5 font-semibold text-accent-ink disabled:opacity-40">
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {message && <p className="mt-2 text-sm text-danger">{message}</p>}
    </form>
  );
}

// Find people by @username or name.
function Search({ onAction }: { onAction: (f: () => Promise<{ ok: true } | { ok: false; message: string }>) => void }) {
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
    <section className="mt-8">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Find people by @username or name"
        aria-label="Find people"
        className="w-full rounded-full border border-line bg-paper px-5 py-3 focus:border-ink [&::-webkit-search-cancel-button]:hidden"
        style={{ outline: "none" }}
      />
      {shown && (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-card border border-line bg-paper">
          {shown.length === 0 && <li className="px-5 py-4 text-sm text-muted">Nobody found.</li>}
          {shown.map((p) => (
            <Row key={p.id} person={p} href={p.relation === "friend" && p.username ? `/social/${p.username}` : undefined} bare>
              {p.relation === "none" && (
                <Btn primary onClick={() => onAction(async () => { const r = await friendRequest(p.id); setFound((f) => f?.map((x) => (x.id === p.id ? { ...x, relation: "sent" } : x)) ?? f); return r; })}>
                  Add friend
                </Btn>
              )}
              {p.relation === "sent" && <span className="text-sm text-muted">Requested</span>}
              {p.relation === "received" && (
                <Btn primary onClick={() => onAction(async () => { const r = await answerRequest(p.id, true); setFound((f) => f?.map((x) => (x.id === p.id ? { ...x, relation: "friend" } : x)) ?? f); return r; })}>
                  Accept
                </Btn>
              )}
              {p.relation === "friend" && <span className="text-sm text-muted">Friends ✓</span>}
            </Row>
          ))}
        </ul>
      )}
    </section>
  );
}

function Group({ title, count, empty, children }: { title: string; count: number; empty?: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-semibold">
        {title} <span className="text-base font-normal text-muted">{count}</span>
      </h2>
      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-card border border-line bg-paper">
        {count === 0 && empty ? <li className="px-5 py-4 text-sm text-muted">{empty}</li> : children}
      </ul>
    </section>
  );
}

function Row({ person, href, bare, children }: { person: Person; href?: string; bare?: boolean; children?: ReactNode }) {
  const who = (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <Avatar src={person.avatar} name={person.name} size={40} />
      <span className="min-w-0">
        <span className="block truncate font-semibold">{person.name ?? person.username}</span>
        {person.username && <span className="block truncate text-sm text-muted">@{person.username}</span>}
      </span>
    </span>
  );
  return (
    <li className={`flex flex-wrap items-center gap-3 px-5 py-3 ${bare ? "" : ""}`}>
      {href ? (
        <Link href={href} className="flex min-w-0 flex-1 items-center rounded-control hover:opacity-80">
          {who}
        </Link>
      ) : (
        who
      )}
      <span className="flex items-center gap-2">{children}</span>
    </li>
  );
}

function Btn({ children, onClick, primary, danger, disabled }: { children: ReactNode; onClick: () => void; primary?: boolean; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-control px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
        primary ? "bg-accent text-accent-ink hover:opacity-90" : danger ? "text-danger hover:bg-surface" : "ring-1 ring-line hover:bg-surface"
      }`}
    >
      {children}
    </button>
  );
}
