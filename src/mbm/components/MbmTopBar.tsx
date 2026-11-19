"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/mbm/actions";
import TopSearch from "./TopSearch";
import Avatar from "./Avatar";
import { useEffect, useRef, useState } from "react";

// Minute by Minute's top bar: its name, the three pages, and signing out. `owner`: you (signed in
// to the everything-log on this browser) also get a link back to it; nobody else does.
const TABS = [
  { href: "/mbm", label: "Home" },
  { href: "/mbm/day", label: "Day" },
  { href: "/mbm/plan", label: "Plan" },
  { href: "/mbm/stats", label: "Stats" },
];
// (Future sits on its own at the right, next to the search.)
const FUTURE = { href: "/mbm/future", label: "Future" };

export default function MbmTopBar({
  signedIn,
  email,
  owner,
  me = null,
}: {
  signedIn: boolean;
  email: string | null;
  owner: boolean;
  me?: { name: string | null; avatar: string | null } | null;
}) {
  const pathname = usePathname();
  const active = (href: string) => (href === "/mbm" ? pathname === "/mbm" : pathname.startsWith(href));
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full items-center gap-2 px-4 sm:w-[96%] sm:gap-4 sm:px-0">
        <Link href="/mbm" className="mr-2 flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-ink sm:mr-6">
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
          </nav>
        )}
        {signedIn && (
          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-3">
            <Link
              href={FUTURE.href}
              aria-current={active(FUTURE.href) ? "page" : undefined}
              className={`shrink-0 rounded-control px-3 py-2 text-sm font-semibold transition-colors ${
                active(FUTURE.href) ? "bg-accent text-accent-ink" : "text-muted hover:bg-surface hover:text-ink"
              }`}
            >
              {FUTURE.label}
            </Link>
            <div className="hidden min-w-0 flex-1 justify-end md:flex md:max-w-md">
              <TopSearch />
            </div>
          </div>
        )}
        <div className={`flex items-center gap-1 ${signedIn ? "md:ml-2" : ""} ml-auto`}>
          {owner && (
            <Link href="/" title="Back to your everything-log" className="whitespace-nowrap rounded-control px-3 py-2 text-sm text-muted transition-colors hover:bg-surface hover:text-ink">
              <span aria-hidden="true">←</span>
              <span className="hidden sm:inline"> everything-log</span>
              <span className="sr-only sm:hidden">everything-log</span>
            </Link>
          )}
          {signedIn && <ProfileMenu email={email} me={me} />}
        </div>
      </div>
    </header>
  );
}

// You: your picture (or initial). Click for your account, About you, and signing out.
function ProfileMenu({ email, me }: { email: string | null; me: { name: string | null; avatar: string | null } | null }) {
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
          <div className="h-px bg-line" />
          <div className="py-1">
            <Link href="/mbm/account" onClick={() => setOpen(false)} className={item} role="menuitem">
              Your account
            </Link>
            <Link href="/mbm/account#about" onClick={() => setOpen(false)} className={item} role="menuitem">
              About you
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
