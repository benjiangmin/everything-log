"use client";

import { MatchCount } from "@/components/ui/SearchBox";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SearchHit } from "@/lib/budget";
import { formatMoney } from "@/lib/month";
import { MIN_SEARCH_LENGTH } from "@/lib/search-config";

function shortDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Bold the part of the note that matches what you typed.
function Highlight({ text, query }: { text: string; query: string }) {
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[3px] bg-accent/12 font-semibold text-ink">{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}

// Searches notes across all months as you type. Picking a result jumps to that
// month and highlights the expense.
export default function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [total, setTotal] = useState(0); // how many match in all (results may show fewer)
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0); // which result the arrow keys are on
  const boxRef = useRef<HTMLDivElement>(null);

  const q = query.trim();
  const tooShort = q.length < MIN_SEARCH_LENGTH;

  // Fetch results a moment after you stop typing. Older requests are cancelled.
  useEffect(() => {
    if (tooShort) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const res = await fetch(`/api/budget/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const json = await res.json();
        setResults(json.results ?? []);
        setTotal(json.total ?? json.results?.length ?? 0);
        setCursor(0);
        setStatus(res.ok ? "done" : "error");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setStatus("error");
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, tooShort]);

  // Close the results when clicking elsewhere.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function go(hit: SearchHit) {
    setOpen(false);
    setQuery("");
    router.push(`/budget?m=${hit.spent_on.slice(0, 7)}&focus=${hit.id}`);
  }

  const showPanel = open && !tooShort;

  return (
    <div ref={boxRef} className="relative mt-2">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
      >
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
        <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        data-find // Ctrl/Cmd+F jumps here (see SideNav)
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setCursor((c) => Math.min(c + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (e.key === "Enter" && results[cursor]) {
            go(results[cursor]);
          }
        }}
        placeholder="Search entries"
        aria-label="Search expenses by note"
        className="w-full rounded-control border border-line bg-surface py-2.5 pl-10 pr-10 text-ink shadow-md shadow-ink/10 placeholder:text-muted focus:border-ink focus:bg-paper focus:outline-none"
      />

      {query && (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setResults([]);
          }}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-control text-muted hover:bg-line/60 hover:text-ink"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </button>
      )}

      {showPanel && (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-card border border-line bg-paper shadow-xl shadow-ink/10">
          {status === "loading" && results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">Searching…</p>
          ) : status === "error" ? (
            <p className="px-4 py-3 text-sm text-danger">Search isn&apos;t working right now. Try again.</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">No notes match &ldquo;{q}&rdquo;.</p>
          ) : (
            <ul role="listbox" aria-label="Search results" className="max-h-80 overflow-y-auto p-1.5 pt-0">
              <MatchCount shown={results.length} total={total} />
              {results.map((hit, i) => (
                <li key={hit.id} role="option" aria-selected={i === cursor}>
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(hit)}
                    className={`flex w-full items-center gap-3 rounded-control px-3 py-2 text-left ${
                      i === cursor ? "bg-surface" : ""
                    }`}
                  >
                    <span className="num w-24 shrink-0 text-sm text-muted">{shortDate(hit.spent_on)}</span>
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: hit.category_color ?? "var(--muted)" }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      <Highlight text={hit.note ?? ""} query={q} />
                    </span>
                    <span className="num font-medium">{formatMoney(hit.amount)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
