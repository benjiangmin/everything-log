"use client";

import Link from "next/link";
import type { ReactNode } from "react";

// The setup's pieces, shared by the welcome (/mbm/welcome) and the setup after signing up
// (/mbm/setup). The phone's setup (ContentView.swift) is drawn the same way: the clock, a big
// icon on an accent circle, a title, a line of why, short points, then its buttons.

// The app's clock, its hands sweeping round once (the phone's loading screen).
export function Clock({ size = 96 }: { size?: number }) {
  return (
    <span className="setup-pop relative grid place-items-center rounded-full bg-accent text-accent-ink shadow-lg shadow-accent/30" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 96 96" width={size} height={size}>
        <circle cx="48" cy="48" r="35" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="3" />
        <g className="setup-sweep" style={{ transformOrigin: "48px 48px" }}>
          <rect x="46" y="26" width="4" height="22" rx="2" fill="currentColor" />
        </g>
        <g className="setup-sweep-slow" style={{ transformOrigin: "48px 48px" }}>
          <rect x="46" y="34" width="4" height="14" rx="2" fill="currentColor" fillOpacity="0.85" transform="rotate(90 48 48)" />
        </g>
        <circle cx="48" cy="48" r="4" fill="currentColor" />
      </svg>
    </span>
  );
}

// A big icon on an accent circle (the phone uses the same SF Symbols' shapes).
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="setup-pop grid size-20 place-items-center rounded-full bg-accent/15 text-accent" aria-hidden="true">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  );
}

// Where you are in the setup: dots, the one you're on drawn wide (like the phone).
export function Dots({ at, of }: { at: number; of: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5" aria-label={`Step ${at + 1} of ${of}`}>
      {Array.from({ length: of }, (_, i) => (
        <span key={i} className={`h-2 rounded-full transition-all duration-300 ${i <= at ? "bg-accent" : "bg-line"} ${i === at ? "w-6" : "w-2"}`} />
      ))}
    </div>
  );
}

// One slide: sliding in from the side it came from.
export function Slide({ dir, top, title, body, children, actions }: { dir: "fwd" | "back"; top?: ReactNode; title: ReactNode; body?: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className={`flex min-h-[28rem] flex-col ${dir === "fwd" ? "step-in-fwd" : "step-in-back"}`}>
      {top && <div className="mb-6">{top}</div>}
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      {body && <div className="mt-2 text-muted">{body}</div>}
      {children && <div className="mt-6">{children}</div>}
      {actions && <div className="mt-auto flex flex-col gap-2 pt-8">{actions}</div>}
    </div>
  );
}

// Short points with an icon each, coming in one after another.
export function Points({ items }: { items: { icon: ReactNode; title: string; text: string }[] }) {
  return (
    <ul className="grid gap-4">
      {items.map((p, i) => (
        <li key={p.title} className="setup-rise flex items-start gap-4" style={{ animationDelay: `${120 + i * 90}ms` }}>
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-accent" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {p.icon}
            </svg>
          </span>
          <span>
            <span className="block font-semibold">{p.title}</span>
            <span className="block text-sm text-muted">{p.text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Primary({ children, onClick, href, disabled, type = "button" }: { children: ReactNode; onClick?: () => void; href?: string; disabled?: boolean; type?: "button" | "submit" }) {
  const cls = "flex h-12 items-center justify-center rounded-control bg-accent px-6 font-semibold text-accent-ink transition-[opacity,transform] hover:opacity-90 active:scale-[0.98] disabled:opacity-40";
  if (href)
    return href.startsWith("/mbm/google") ? (
      <a href={href} className={cls}>
        {children}
      </a>
    ) : (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

export function Secondary({ children, onClick, href }: { children: ReactNode; onClick?: () => void; href?: string }) {
  const cls = "flex h-11 items-center justify-center rounded-control px-6 text-sm font-semibold text-muted transition-colors hover:bg-surface hover:text-ink";
  if (href)
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

// The card everything sits in: the page's paper, the setup in the middle.
export function Stage({ children, back, onBack }: { children: ReactNode; back?: boolean; onBack?: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-4 h-9">
          {back && (
            <button type="button" onClick={onBack} className="rounded-control px-2 py-1.5 text-sm font-semibold text-muted hover:bg-surface hover:text-ink">
              ← Back
            </button>
          )}
        </div>
        <div className="rounded-[28px] bg-surface/60 p-6 ring-1 ring-line sm:p-10">{children}</div>
      </div>
    </main>
  );
}
