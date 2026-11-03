"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { allApps, type AppHit } from "@/app/search-actions";

// The home page's app search (from the sidebar): slides in from the right like the budget's
// panels. Type to filter every app by name, description or category; click one (or ↑ ↓ Enter)
// to go there.
export default function AppSearchPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [apps, setApps] = useState<AppHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let live = true;
    allApps().then((res) => {
      if (!live) return;
      if ("error" in res) setError(res.error);
      else setApps(res.apps);
    });
    return () => {
      live = false;
    };
  }, []);

  // Every word typed has to appear somewhere in the app's name, description or category.
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = (apps ?? []).filter((a) => {
    const text = `${a.name} ${a.blurb ?? ""} ${a.category}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
  const current = Math.min(active, Math.max(0, hits.length - 1));

  // Keep the highlighted one in view while arrowing through the list.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [current]);

  function open(app: AppHit) {
    onClose();
    router.push(app.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(current + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(current - 1, 0));
    } else if (e.key === "Enter" && hits[current]) {
      e.preventDefault();
      open(hits[current]);
    }
  }

  return (
    <div className="fixed inset-0 z-[70]" onKeyDown={onKeyDown}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/30" />
      <aside aria-label="Search apps" className="panel-slide absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-paper shadow-2xl shadow-ink/30">
        <header className="flex items-center gap-2 border-b border-line px-4 py-4">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-control border border-line bg-surface px-3 focus-within:border-ink">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-muted">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              placeholder="Search apps"
              aria-label="Search apps"
              style={{ outline: "none" }}
              className="min-w-0 flex-1 bg-transparent py-2.5 text-ink placeholder:text-muted/70"
            />
          </label>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 [scrollbar-width:thin]">
          {error && <p className="rounded-card bg-surface px-4 py-3 text-sm text-danger">{error}</p>}
          {!apps && !error && <p className="px-2 py-3 text-sm text-muted">Loading…</p>}
          {apps && hits.length === 0 && (
            <p className="rounded-card border border-dashed border-line px-5 py-8 text-center text-muted">No apps match “{query}”.</p>
          )}
          <ul ref={listRef} className="space-y-1">
            {hits.map((a, i) => (
              <li key={a.id}>
                <button
                  type="button"
                  data-active={i === current}
                  onClick={() => open(a)}
                  onMouseMove={() => setActive(i)}
                  className={`flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left transition-colors ${
                    i === current ? "bg-surface" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{a.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {a.category}
                      {a.blurb && <> · {a.blurb}</>}
                    </span>
                  </span>
                  <span aria-hidden="true" className={`text-muted transition-opacity ${i === current ? "opacity-100" : "opacity-0"}`}>
                    →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
