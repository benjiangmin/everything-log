"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { lock, lockOtherDevices } from "@/app/login/actions";
import { inboxCount } from "@/app/budget/inbox-actions";
import InboxPanel from "@/components/budget/InboxPanel";
import SubscriptionsPanel from "@/components/subscriptions/SubscriptionsPanel";
import { useEffect, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";

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
  const pathname = usePathname();
  const open = useSyncExternalStore(subscribe, readOpen, () => false); // wide screens
  const [drawer, setDrawer] = useState(false); // phones

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
      {/* Budget only: purchases read from your alert emails, waiting for review. */}
      {pathname.startsWith("/budget") && (
        <>
          <InboxButton showLabel={labels} />
          <SubscriptionsButton showLabel={labels} />
        </>
      )}
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
        <div className="mt-auto flex flex-col gap-1">
          <LockOthersButton showLabel={open} />
          <LockButton showLabel={open} />
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
            <div className="mt-auto flex flex-col gap-1">
              <LockOthersButton showLabel />
              <LockButton showLabel />
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}

// "New purchases": a tray with a ! when emails have brought in purchases to review.
// Checks every minute and whenever you come back to the tab.
function InboxButton({ showLabel }: { showLabel: boolean }) {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    const check = () => inboxCount().then((n) => live && setCount(n));
    check();
    const timer = setInterval(check, 60_000);
    window.addEventListener("focus", check);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, []);

  return (
    <>
      <NavButton
        label={count ? `New purchases (${count})` : "New purchases"}
        showLabel={showLabel}
        onClick={() => setOpen(true)}
        badge={count > 0}
      >
        <path d="M3 13h5l1.5 3h5L16 13h5" />
        <path d="M5.5 5h13L21 13v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5L5.5 5z" />
      </NavButton>
      {open && (
        <InboxPanel
          onClose={() => setOpen(false)}
          onChanged={() => setCount((c) => Math.max(0, c - 1))}
        />
      )}
    </>
  );
}

// Budget only: your monthly subscriptions, with a link to the Subscriptions page.
function SubscriptionsButton({ showLabel }: { showLabel: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <NavButton label="Subscriptions" showLabel={showLabel} onClick={() => setOpen(true)}>
        <path d="M17 2l4 4-4 4" />
        <path d="M3 11V9a3 3 0 0 1 3-3h15" />
        <path d="M7 22l-4-4 4-4" />
        <path d="M21 13v2a3 3 0 0 1-3 3H3" />
      </NavButton>
      {open && <SubscriptionsPanel onClose={() => setOpen(false)} />}
    </>
  );
}

// Signs this browser out (you'll need the password again).
function LockButton({ showLabel }: { showLabel: boolean }) {
  return (
    <form action={lock}>
      <NavButton label="Lock site" showLabel={showLabel} submit>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </NavButton>
    </form>
  );
}

// Signs out every other browser and phone (this one stays unlocked). Asks for the password first.
function LockOthersButton({ showLabel }: { showLabel: boolean }) {
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ text: string; ok?: boolean } | null>(null);
  const [pending, start] = useTransition();

  const close = () => {
    setAsking(false);
    setPassword("");
    setMessage(null);
  };

  return (
    <>
      <NavButton label="Lock other devices" showLabel={showLabel} onClick={() => setAsking(true)}>
        <rect x="2" y="4" width="13" height="10" rx="1.5" />
        <path d="M6 18h5" />
        <rect x="15" y="14" width="7" height="6" rx="1" />
        <path d="M16.5 14v-1.5a2 2 0 0 1 4 0V14" />
      </NavButton>

      {asking && (
        <div className="fixed inset-0 z-[70] grid place-items-center p-4">
          <button type="button" aria-label="Cancel" onClick={close} className="absolute inset-0 bg-ink/30" />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const res = await lockOtherDevices(password);
                if (!res.ok) return setMessage({ text: res.message });
                setPassword("");
                setMessage({ text: "Done. Every other device will need the password again.", ok: true });
              });
            }}
            onKeyDown={(e) => e.key === "Escape" && close()}
            className="relative w-full max-w-sm rounded-card bg-paper p-5 shadow-2xl shadow-ink/25"
          >
            <h2 className="font-display text-lg font-semibold">Lock all other devices?</h2>
            <p className="mt-1 text-sm text-muted">Every other browser and phone will need the password again. This one stays unlocked.</p>
            {message?.ok ? (
              <p className="mt-4 rounded-control bg-accent/10 px-3 py-2.5 text-sm text-ink">{message.text}</p>
            ) : (
              <input
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                aria-label="Password"
                autoComplete="current-password"
                style={{ outline: "none" }}
                className="mt-4 w-full rounded-control border border-line bg-surface px-3 py-2.5 text-ink placeholder:text-muted/70 focus:border-ink"
              />
            )}
            {message && !message.ok && <p className="mt-2 text-sm text-danger">{message.text}</p>}
            <div className="mt-4 flex justify-end gap-2">
              {message?.ok ? (
                <button type="button" onClick={close} className="rounded-control bg-accent px-5 py-2 text-sm font-semibold text-accent-ink hover:opacity-90">
                  Done
                </button>
              ) : (
                <>
                  <button type="button" onClick={close} className="rounded-control px-4 py-2 text-sm text-muted hover:bg-surface hover:text-ink">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={pending || !password}
                    className="rounded-control bg-accent px-5 py-2 text-sm font-semibold text-accent-ink hover:opacity-90 disabled:opacity-50"
                  >
                    {pending ? "Locking…" : "Lock them"}
                  </button>
                </>
              )}
            </div>
          </form>
        </div>
      )}
    </>
  );
}

// One button in the bar: an icon, and its label when the bar is open. A link, an action, or a
// form's submit button.
function NavButton({
  label,
  showLabel,
  href,
  onClick,
  active,
  submit,
  badge,
  children,
}: {
  label: string;
  showLabel: boolean;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  submit?: boolean;
  badge?: boolean; // a little "!" on the icon
  children: ReactNode; // the icon's path(s)
}) {
  const className = `flex h-10 w-full items-center gap-3 overflow-hidden whitespace-nowrap rounded-control px-[11px] text-sm font-semibold transition-colors ${
    active ? "bg-accent text-accent-ink" : "text-muted hover:bg-line/70 hover:text-ink"
  }`;
  const inner = (
    <>
      <span className="relative shrink-0">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {children}
        </svg>
        {badge && (
          <span
            aria-hidden="true"
            className="absolute -right-2 -top-2 grid size-[15px] place-items-center rounded-full bg-danger text-[10px] font-bold leading-none text-white ring-2 ring-surface"
          >
            !
          </span>
        )}
      </span>
      <span className={`transition-opacity duration-200 ${showLabel ? "opacity-100" : "opacity-0"}`}>{label}</span>
    </>
  );
  return href ? (
    <Link href={href} aria-label={label} title={showLabel ? undefined : label} className={className}>
      {inner}
    </Link>
  ) : (
    <button type={submit ? "submit" : "button"} onClick={onClick} aria-label={label} title={showLabel ? undefined : label} className={className}>
      {inner}
    </button>
  );
}
