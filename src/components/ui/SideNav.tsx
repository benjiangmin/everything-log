"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

// The navigation bar on the left of every page (not the login page).
//  - Wide screens: a slim rail of icons. The » at the bottom slides it open to show labels too;
//    it floats over the page (nothing underneath moves) and remembers being open or closed.
//  - Phones: a round button at the bottom-left opens the same panel as a drawer.
// More buttons can be added to ITEMS later.

const RAIL = "3.5rem"; // closed width (keep in step with the padding in globals.css)
const OPEN = "13rem"; // open width

// Remembered per browser (just a convenience; if storage is blocked it simply starts closed).
const KEY = "side-nav-open";
const listeners = new Set<() => void>();
const readOpen = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};
const writeOpen = (open: boolean) => {
  try {
    localStorage.setItem(KEY, open ? "1" : "0");
  } catch {
    // storage blocked: it just won't be remembered
  }
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

// The bar itself. Hidden on the login page. The room it needs on the left is made in globals.css
// (body:has([data-side-nav])), so pages don't have to know about it.
export default function SideNav() {
  const router = useRouter();
  const pathname = usePathname();
  const open = useSyncExternalStore(subscribe, readOpen, () => false); // wide screens
  const [drawer, setDrawer] = useState(false); // phones

  // Back: the previous page, or Home if this tab started here.
  const back = () => {
    if (window.history.length > 1) router.back();
    else router.push("/");
  };

  // Phones: close the drawer after moving somewhere, or with Escape.
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    setDrawer(false);
  }
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer]);

  const items = (labels: boolean) => (
    <>
      <NavButton label="Home" showLabel={labels} href="/" active={pathname === "/"}>
        <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-8z" />
      </NavButton>
      <NavButton label="Back" showLabel={labels} onClick={back}>
        <path d="M15 5l-7 7 7 7" />
      </NavButton>
    </>
  );

  if (pathname === "/login") return null;

  return (
    <div data-side-nav>
      {/* ---------- Wide screens: the rail ---------- */}
      <nav
        aria-label="Navigation"
        style={{ width: open ? OPEN : RAIL }}
        className={`fixed inset-y-0 left-0 z-50 hidden flex-col border-r border-line bg-surface px-2 py-4 transition-[width,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none md:flex ${
          open ? "shadow-xl shadow-ink/15" : ""
        }`}
      >
        <div className="flex flex-col gap-1">{items(open)}</div>
        <div className="mt-auto">
          <NavButton label={open ? "Collapse" : "Expand"} showLabel={open} onClick={() => writeOpen(!open)}>
            {open ? <path d="M17 6l-6 6 6 6M11 6l-6 6 6 6" /> : <path d="M7 6l6 6-6 6M13 6l6 6-6 6" />}
          </NavButton>
        </div>
      </nav>

      {/* ---------- Phones: a round button + drawer ---------- */}
      <button
        type="button"
        onClick={() => setDrawer(true)}
        aria-label="Open navigation"
        className="fixed bottom-4 left-4 z-50 grid size-12 place-items-center rounded-full bg-accent text-accent-ink shadow-lg shadow-ink/25 md:hidden"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      {drawer && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button type="button" aria-label="Close navigation" onClick={() => setDrawer(false)} className="absolute inset-0 bg-ink/25" />
          <nav aria-label="Navigation" className="absolute inset-y-0 left-0 flex w-56 flex-col gap-1 bg-surface px-2 py-4 shadow-xl shadow-ink/20">
            {items(true)}
          </nav>
        </div>
      )}
    </div>
  );
}

// One button in the bar: an icon, and its label when the bar is open. Either a link or an action.
function NavButton({
  label,
  showLabel,
  href,
  onClick,
  active,
  children,
}: {
  label: string;
  showLabel: boolean;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  children: ReactNode; // the icon's path(s)
}) {
  const className = `flex h-10 w-full items-center gap-3 overflow-hidden whitespace-nowrap rounded-control px-[11px] text-sm font-semibold transition-colors ${
    active ? "bg-accent text-accent-ink" : "text-muted hover:bg-line/70 hover:text-ink"
  }`;
  const inner = (
    <>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
        {children}
      </svg>
      <span className={`transition-opacity duration-200 ${showLabel ? "opacity-100" : "opacity-0"}`}>{label}</span>
    </>
  );
  return href ? (
    <Link href={href} aria-label={label} title={showLabel ? undefined : label} className={className}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-label={label} title={showLabel ? undefined : label} className={className}>
      {inner}
    </button>
  );
}
