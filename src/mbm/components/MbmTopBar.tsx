"use client";

import Link from "next/link";
import ThemeChoice from "@/components/ui/ThemeChoice";
import { usePathname, useSearchParams } from "next/navigation";
import { signOut } from "@/app/mbm/actions";
import TopSearch from "./TopSearch";
import Avatar from "./Avatar";
import { Suspense, useEffect, useRef, useState } from "react";
import { atLabel, useMinute, useReflectOpen } from "@/mbm/reflectAt";
import { clean } from "@/mbm/paths";

// Minute by Minute's top bar: its name, the three pages, and signing out. `owner`: you (signed in
// to the everything-log on this browser) also get a link back to it; nobody else does.
const TABS = [
  { href: "/", label: "Home" },
  { href: "/day", label: "Day" },
  { href: "/plan", label: "Plan" },
  { href: "/stats", label: "Stats" },
];
// (Future sits on its own at the right, between the search and your profile.)
const FUTURE = { href: "/future", label: "Future" };

export default function MbmTopBar({
  signedIn,
  email,
  owner,
  me = null,
  phone = null,
  now = 0,
}: {
  signedIn: boolean;
  email: string | null;
  owner: boolean;
  me?: { name: string | null; avatar: string | null } | null;
  phone?: { name: string | null; last_seen: string } | null;
  now?: number;
}) {
  const pathname = clean(usePathname()); // (the same on the server, /mbm/day, and here, /day)
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <header data-covers-map className="sticky top-0 z-50 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full items-center gap-2 px-4 sm:w-[96%] sm:gap-4 sm:px-0">
        <Link href="/" className="mr-2 flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-ink sm:mr-6">
          <span aria-hidden="true" className="grid size-7 place-items-center rounded-full bg-accent text-accent-ink">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 7.5V12l3 2" />
            </svg>
          </span>
          <span className="hidden sm:inline">Minute by Minute</span>
        </Link>
        {signedIn && (
          <nav aria-label="Pages" className="flex items-center gap-1">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active(t.href) ? "page" : undefined}
                className={`rounded-control px-3 py-2 text-sm font-semibold transition-colors ${
                  active(t.href) ? "bg-accent text-accent-ink" : "text-muted hover:bg-surface hover:text-ink"
                }`}
              >
                {t.label}
              </Link>
            ))}
            <ReflectTab active={active("/reflect")} />
          </nav>
        )}
        {signedIn && (
          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-3">
            <div className="hidden min-w-0 flex-1 justify-end md:flex md:max-w-md">
              <TopSearch />
            </div>
            <Link
              href={FUTURE.href}
              aria-current={active(FUTURE.href) ? "page" : undefined}
              className={`shrink-0 rounded-control px-3 py-2 text-sm font-semibold transition-colors ${
                active(FUTURE.href) ? "bg-accent text-accent-ink" : "text-muted hover:bg-surface hover:text-ink"
              }`}
            >
              {FUTURE.label}
            </Link>
          </div>
        )}
        <div className={`flex items-center gap-1 ${signedIn ? "md:ml-2" : ""} ml-auto`}>
          {/* (The link back to your everything-log is on Home now, above the greeting.) */}
          {owner && !signedIn && (
            <Link href="https://www.benbadobee.com/" title="Back to your everything-log" className="whitespace-nowrap rounded-control px-3 py-2 text-sm text-muted transition-colors hover:bg-surface hover:text-ink">
              <span aria-hidden="true">←</span>
              <span className="hidden sm:inline"> everything-log</span>
              <span className="sr-only sm:hidden">everything-log</span>
            </Link>
          )}
          {signedIn && <ProfileMenu email={email} me={me} phone={phone} now={now} />}
        </div>
      </div>
    </header>
  );
}

// Reflect: a walk back through today. Greyed out (not a link) until the evening, at the time set
// on Your account (11 PM unless you change it).
function ReflectTab({ active }: { active: boolean }) {
  return (
    <Suspense fallback={<ReflectTabFor active={active} pastDay={null} />}>
      <ReflectTabWithDay active={active} />
    </Suspense>
  );
}

// (On the Day tab looking at a day before today: Reflect opens on that day, whatever the time.)
function ReflectTabWithDay({ active }: { active: boolean }) {
  const path = clean(usePathname());
  const day = useSearchParams().get("day");
  const minute = useMinute();
  const today = minute === null ? null : localDayKey(new Date(minute * 60000));
  const pastDay = path === "/day" && day && /^\d{4}-\d{2}-\d{2}$/.test(day) && today && day < today ? day : null;
  return <ReflectTabFor active={active} pastDay={pastDay} />;
}

function ReflectTabFor({ active, pastDay }: { active: boolean; pastDay: string | null }) {
  const { open, at } = useReflectOpen();
  const look = "flex items-center gap-1.5 rounded-control px-3 py-2 text-sm font-semibold transition-colors";
  const moon = (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    </svg>
  );
  if (!open && !active && !pastDay) {
    return (
      <span aria-disabled="true" title={`Reflect opens at ${atLabel(at)}`} className={`${look} cursor-not-allowed text-muted opacity-45`}>
        {moon}
        Reflect
      </span>
    );
  }
  return (
    <Link
      href={pastDay ? `/reflect?day=${pastDay}` : "/reflect"}
      title={pastDay ? "Reflect on this day" : undefined}
      aria-current={active ? "page" : undefined}
      className={`${look} ${active ? "bg-accent text-accent-ink" : "reflect-glow text-ink hover:bg-surface"}`}
    >
      {moon}
      Reflect
    </Link>
  );
}

// "2026-11-22", in this browser's time.
const localDayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// You: your picture (or initial). Click for your account, About you, and signing out.
function ProfileMenu({
  email,
  me,
  phone,
  now,
}: {
  email: string | null;
  me: { name: string | null; avatar: string | null } | null;
  phone: { name: string | null; last_seen: string } | null;
  now: number;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const item = "block w-full rounded-control px-3 py-2 text-left text-sm hover:bg-surface";
  return (
    <div ref={box} className="relative ml-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Your account"
        className="grid place-items-center rounded-full p-0.5 ring-offset-2 ring-offset-paper transition-shadow hover:ring-2 hover:ring-line"
      >
        <Avatar src={me?.avatar} name={me?.name} email={email} size={34} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-[60] mt-2 w-64 rounded-card border border-line bg-paper p-2 shadow-xl shadow-ink/15">
          <div className="flex items-center gap-3 px-3 pb-3 pt-2">
            <Avatar src={me?.avatar} name={me?.name} email={email} size={40} />
            <div className="min-w-0">
              <p className="truncate font-semibold">{me?.name || "You"}</p>
              <p className="truncate text-xs text-muted">{email}</p>
            </div>
          </div>
          {/* The phone linked to your account (one at a time: signing in on another takes over). */}
          <div className="mx-1 mb-2 flex items-center gap-2.5 rounded-control bg-surface px-3 py-2">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
              <path d="M10.5 18.5h3" strokeLinecap="round" />
            </svg>
            <div className="min-w-0 text-xs">
              {phone ? (
                <>
                  <p className="truncate font-semibold text-ink">{phone.name || "Your phone"}</p>
                  <p className="text-muted">Linked · seen {ago(now - +new Date(phone.last_seen))}</p>
                </>
              ) : (
                <p className="text-muted">No phone linked yet: sign in on the app.</p>
              )}
            </div>
          </div>
          <div className="h-px bg-line" />
          <div className="py-1">
            <div className="px-3 pb-2 pt-1.5">
              <ThemeChoice app="mbm" />
            </div>
            <Link href="/account" onClick={() => setOpen(false)} className={item} role="menuitem">
              Your account
            </Link>
            <Link href="/account#about" onClick={() => setOpen(false)} className={item} role="menuitem">
              About you
            </Link>
            <Link href="/account/jobs" onClick={() => setOpen(false)} className={item} role="menuitem">
              Jobs and categories
            </Link>
            <Link href="/account/places" onClick={() => setOpen(false)} className={item} role="menuitem">
              Places
            </Link>
          </div>
          <div className="h-px bg-line" />
          <form action={signOut} className="pt-1">
            <button type="submit" className={`${item} text-muted`} role="menuitem">
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// "just now", "5 min ago", "3 h ago", "2 days ago".
function ago(ms: number) {
  const m = Math.round(ms / 60000);
  if (m < 2) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

