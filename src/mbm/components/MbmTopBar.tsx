"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/mbm/actions";
import TopSearch from "./TopSearch";

// Minute by Minute's top bar: its name, the three pages, and signing out. `owner`: you (signed in
// to the everything-log on this browser) also get a link back to it; nobody else does.
const TABS = [
  { href: "/mbm", label: "Home" },
  { href: "/mbm/day", label: "Day" },
  { href: "/mbm/stats", label: "Stats" },
];

export default function MbmTopBar({ signedIn, email, owner }: { signedIn: boolean; email: string | null; owner: boolean }) {
  const pathname = usePathname();
  const active = (href: string) => (href === "/mbm" ? pathname === "/mbm" : pathname.startsWith(href));
  return (
    <header className="border-b border-line bg-paper">
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
          <div className="ml-auto hidden min-w-0 flex-1 justify-end md:flex">
            <TopSearch />
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
          {signedIn && (
            <form action={signOut}>
              <button
                type="submit"
                title={email ? `Signed in as ${email}` : undefined}
                className="whitespace-nowrap rounded-control px-3 py-2 text-sm text-muted transition-colors hover:bg-surface hover:text-ink"
              >
                Sign out
              </button>
            </form>
          )}
        </div>
      </div>
    </header>
  );
}
