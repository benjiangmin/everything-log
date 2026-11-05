"use client";

import { useEffect, type ReactNode } from "react";

// A panel sliding in from the right, like the sidebar's other panels. Escape or the dimmed page closes it.
export default function SidePanel({ title, subtitle, onClose, children }: { title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70]">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-ink/30" />
      <aside aria-label={title} className="panel-slide absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-paper shadow-2xl shadow-ink/30">
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold">{title}</h2>
            {subtitle && <div className="text-sm text-muted">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 grid size-9 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 [scrollbar-width:thin]">{children}</div>
      </aside>
    </div>
  );
}
