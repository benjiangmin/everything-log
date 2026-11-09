"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchEverything, type SearchHit } from "@/app/mbm/actions";

// The top bar's search: your activities, entries (and their notes), places and apps, as you type.
// ⌘K / Ctrl+K jumps to it; ↑ ↓ to pick, Enter to go, Esc to close.

const GROUPS: { kind: SearchHit["kind"]; title: string }[] = [
  { kind: "activity", title: "Activities" },
  { kind: "entry", title: "Entries" },
  { kind: "place", title: "Places" },
  { kind: "app", title: "Apps" },
];

export default function TopSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const [pending, run] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const asked = useRef(0);

  // ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Close on a click elsewhere.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  // Look things up a moment after you stop typing (only the latest answer counts).
  useEffect(() => {
    const text = q.trim();
    const n = ++asked.current;
    if (!text) return;
    const t = setTimeout(() => {
      run(async () => {
        const found = await searchEverything(text);
        if (n === asked.current) {
          setHits(found);
          setSel(0);
        }
      });
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const shown = q.trim() ? hits : [];
  // In the order they're listed (grouped), for ↑ ↓.
  const ordered = GROUPS.flatMap((g) => shown.filter((h) => h.kind === g.kind));
  const go = (h: SearchHit | undefined) => {
    if (!h) return;
    setOpen(false);
    setQ("");
    input.current?.blur();
    router.push(h.href);
  };

  return (
    <div ref={box} className="relative w-full max-w-sm">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.2" />
        <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      <input
        ref={input}
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            input.current?.blur();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setSel((s) => Math.min(ordered.length - 1, s + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSel((s) => Math.max(0, s - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            go(ordered[sel]);
          }
        }}
        placeholder="Search everything"
        aria-label="Search activities, entries, places and apps"
        className="w-full rounded-full border border-line bg-surface/60 py-2 pl-9 pr-12 text-sm outline-none transition-colors placeholder:text-muted focus:border-ink focus:bg-paper [&::-webkit-search-cancel-button]:hidden"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 text-[11px] text-muted sm:block">⌘K</kbd>

      {open && q.trim() && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-card bg-paper p-2 shadow-2xl shadow-ink/20 ring-1 ring-line sm:-right-24">
          {ordered.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted">{pending ? "Looking…" : `Nothing called “${q.trim()}”.`}</p>
          ) : (
            GROUPS.map((g) => {
              const list = ordered.filter((h) => h.kind === g.kind);
              if (!list.length) return null;
              return (
                <div key={g.kind} className="py-1">
                  <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{g.title}</p>
                  <ul>
                    {list.map((h) => {
                      const i = ordered.indexOf(h);
                      return (
                        <li key={`${h.kind}-${h.name}-${h.detail}`}>
                          <button
                            type="button"
                            onMouseEnter={() => setSel(i)}
                            onClick={() => go(h)}
                            className={`flex w-full items-center gap-3 rounded-control px-3 py-2 text-left ${i === sel ? "bg-surface" : ""}`}
                          >
                            <Icon hit={h} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-ink">{h.name}</span>
                              {h.kind === "entry" && h.note && <span className="block truncate text-xs text-ink/80">“{h.note}”</span>}
                            </span>
                            <span className="shrink-0 text-xs text-muted">{h.detail}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function Icon({ hit }: { hit: SearchHit }) {
  if (hit.kind === "activity" || hit.kind === "entry") {
    return <span aria-hidden="true" className={`shrink-0 rounded-full ${hit.kind === "activity" ? "size-3" : "size-2.5 ring-2 ring-paper"}`} style={{ background: hit.color }} />;
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-muted">
      {hit.kind === "place" ? (
        <>
          <path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0113 0c0 4.8-6.5 11-6.5 11z" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="10" r="2.2" fill="currentColor" />
        </>
      ) : (
        <>
          <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" stroke="currentColor" strokeWidth="2" />
          <path d="M11 18.5h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
