"use client";

import { useEffect, useState, useTransition } from "react";
import { applyMatches, lookupTitles, suggestMatches, unmatchedTitles, type Choice } from "@/app/catalog-actions";
import type { Match } from "@/lib/catalog";

type Kind = "anime" | "game";
type Row = { id: string; title: string; matches: Match[] | null; pick: number }; // matches null = still looking

// AniList allows ~30 lookups a minute right now, so anime goes 8 titles per request, a bit over
// 2 seconds apart. IGDB is much quicker (10 titles per request).
const BATCH = { anime: 8, game: 10 };
const GAP_MS = { anime: 2100, game: 300 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Slides in from the right: every title that doesn't have a cover yet, with its best match from
// AniList / IGDB. Accept it (title + cover get saved), pick another, search again, or keep yours.
export default function FindCoversPanel({ kind, onClose }: { kind: Kind; onClose: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waitNote, setWaitNote] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    let live = true;
    (async () => {
      const res = await unmatchedTitles(kind);
      if (!live) return;
      if (!res.ok) return setError(res.message);
      setRows(res.items.map((i) => ({ ...i, matches: null, pick: 0 })));

      for (let at = 0; at < res.items.length && live; ) {
        const batch = res.items.slice(at, at + BATCH[kind]);
        const found = await suggestMatches(kind, batch.map((b) => b.title));
        if (!live) return;
        if (!found.ok) {
          if (!found.wait) return setError(found.message);
          setWaitNote(`Slowing down for ${found.wait}s (lookup limit)…`);
          await sleep(found.wait * 1000);
          setWaitNote(null);
          continue; // same batch again
        }
        const byId = new Map(batch.map((b, i) => [b.id, found.matches[i] ?? []]));
        setRows((rs) => rs && rs.map((r) => (byId.has(r.id) ? { ...r, matches: byId.get(r.id)! } : r)));
        at += batch.length;
        if (at < res.items.length) await sleep(GAP_MS[kind]);
      }
    })();
    return () => {
      live = false;
    };
  }, [kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function save(choices: Choice[]) {
    const ids = new Set(choices.map((c) => c.id));
    setRows((rs) => rs && rs.filter((r) => !ids.has(r.id)));
    startSaving(async () => {
      const res = await applyMatches(kind, choices);
      if (!res.ok) setError(res.message ?? "Couldn't save.");
    });
  }

  const update = (id: string, patch: Partial<Row>) => setRows((rs) => rs && rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const looked = rows?.filter((r) => r.matches) ?? [];
  const ready = looked.filter((r) => r.matches!.length > 0);
  const total = rows?.length ?? 0;
  const lookingUp = rows !== null && looked.length < total && !error;
  const noun = kind === "anime" ? "anime" : "games";

  return (
    <div className="fixed inset-0 z-[70]">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/30" />
      <aside aria-label="Find covers" className="panel-slide absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-paper shadow-2xl shadow-ink/30">
        <header className="border-b border-line px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold">Find covers</h2>
              <p className="text-sm text-muted" role="status">
                {error
                  ? ""
                  : rows === null
                    ? "Loading…"
                    : total === 0
                      ? `All your ${noun} have covers`
                      : waitNote ?? (lookingUp ? `Looking up ${looked.length} of ${total}…` : `${total} to review`)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-9 place-items-center rounded-control text-muted transition-colors hover:bg-surface hover:text-ink"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          {ready.length > 1 && !lookingUp && (
            <button
              type="button"
              disabled={saving}
              onClick={() => save(ready.map((r) => ({ id: r.id, match: r.matches![r.pick] })))}
              className="mt-3 h-10 w-full rounded-control bg-accent font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              Accept all {ready.length} suggestions
            </button>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-gutter:stable] [scrollbar-width:thin]">
          {error && <p className="mb-3 rounded-card bg-surface px-4 py-3 text-sm text-danger">{error}</p>}
          {rows && total === 0 && !error && (
            <p className="rounded-card border border-dashed border-line px-5 py-8 text-center text-muted">
              Nothing to match. New ones get a cover when you pick them from the title search.
            </p>
          )}
          <ul className="space-y-3 pb-24">
            {rows?.map((r) => (
              <MatchCard
                key={r.id}
                kind={kind}
                row={r}
                onPick={(pick) => update(r.id, { pick })}
                onMatches={(matches) => update(r.id, { matches, pick: 0 })}
                onAccept={() => r.matches?.[r.pick] && save([{ id: r.id, match: r.matches[r.pick] }])}
                onKeep={() => save([{ id: r.id, match: null }])}
              />
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function MatchCard({
  kind,
  row,
  onPick,
  onMatches,
  onAccept,
  onKeep,
}: {
  kind: Kind;
  row: Row;
  onPick: (i: number) => void;
  onMatches: (m: Match[]) => void;
  onAccept: () => void;
  onKeep: () => void;
}) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState(row.title);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const best = row.matches?.[row.pick];

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setBusy(true);
    const res = await lookupTitles(kind, query);
    setBusy(false);
    if (!res.ok) return setNote(res.message);
    setNote(res.matches.length ? null : "No matches for that.");
    if (res.matches.length) {
      onMatches(res.matches.slice(0, 6));
      setSearching(false);
    }
  }

  return (
    <li className="rounded-card bg-surface p-3">
      <div className="flex gap-3">
        <Cover url={best?.cover_url ?? null} title={best?.title ?? row.title} loading={!row.matches} />
        <div className="min-w-0 flex-1">
          {row.matches === null ? (
            <>
              <p className="break-words font-semibold leading-snug text-ink">{row.title}</p>
              <p className="mt-0.5 text-xs text-muted">Looking…</p>
            </>
          ) : best ? (
            <>
              <p className="break-words font-semibold leading-snug text-ink">
                {best.title}
                {best.year && <span className="ml-1.5 text-xs font-normal text-muted">{best.year}</span>}
                {best.movie && <span className="ml-1.5 text-xs font-normal text-muted">· Movie</span>}
              </p>
              {best.title.toLowerCase() !== row.title.toLowerCase() && (
                <p className="mt-0.5 break-words text-xs text-muted">You wrote: {row.title}</p>
              )}
            </>
          ) : (
            <>
              <p className="break-words font-semibold leading-snug text-ink">{row.title}</p>
              <p className="mt-0.5 text-xs text-muted">No match found</p>
            </>
          )}

          {/* The other matches: click one to use it instead. */}
          {row.matches && row.matches.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Other matches">
              {row.matches.map((m, i) => (
                <button
                  key={m.source_id}
                  type="button"
                  role="radio"
                  aria-checked={i === row.pick}
                  aria-label={`${m.title}${m.year ? ` (${m.year})` : ""}`}
                  title={`${m.title}${m.year ? ` (${m.year})` : ""}`}
                  onClick={() => onPick(i)}
                  className={`overflow-hidden rounded-[4px] transition ${
                    i === row.pick ? "ring-2 ring-accent ring-offset-1 ring-offset-surface" : "opacity-60 hover:opacity-100"
                  }`}
                >
                  <Thumb url={m.cover_url} title={m.title} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {searching && (
        <form onSubmit={search} className="mt-3 flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            maxLength={150}
            aria-label="Search for"
            style={{ outline: "none" }}
            className="min-w-0 flex-1 rounded-control border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-ink"
          />
          <button type="submit" disabled={busy} className="rounded-control bg-paper px-3 text-sm font-semibold text-ink ring-1 ring-line hover:ring-ink disabled:opacity-60">
            {busy ? "…" : "Search"}
          </button>
        </form>
      )}
      {note && <p className="mt-2 text-xs text-danger">{note}</p>}

      {row.matches && (
        <div className="mt-3 flex items-center gap-1">
          {best && (
            <button
              type="button"
              onClick={onAccept}
              className="flex items-center gap-1.5 rounded-control bg-accent px-3.5 py-1.5 text-sm font-semibold text-accent-ink transition-opacity hover:opacity-90"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Accept
            </button>
          )}
          <button
            type="button"
            onClick={() => setSearching((s) => !s)}
            aria-expanded={searching}
            className="rounded-control px-3 py-1.5 text-sm text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            Search again
          </button>
          <button
            type="button"
            onClick={onKeep}
            title="Keep your title with no cover, and stop suggesting"
            className="ml-auto rounded-control px-3 py-1.5 text-sm text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            Keep mine
          </button>
        </div>
      )}
    </li>
  );
}

function Cover({ url, title, loading }: { url: string | null; title: string; loading: boolean }) {
  if (loading) return <div aria-hidden="true" className="h-[4.5rem] w-[3.25rem] shrink-0 animate-pulse rounded-[6px] bg-line/70" />;
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote cover
    <img src={url} alt="" className="h-[4.5rem] w-[3.25rem] shrink-0 rounded-[6px] object-cover" />
  ) : (
    <div aria-hidden="true" className="grid h-[4.5rem] w-[3.25rem] shrink-0 place-items-center rounded-[6px] bg-line/70 font-display text-lg font-semibold text-muted">
      {title.trim().charAt(0).toUpperCase() || "?"}
    </div>
  );
}

function Thumb({ url, title }: { url: string | null; title: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote cover
    <img src={url} alt="" className="block h-10 w-7 object-cover" />
  ) : (
    <span aria-hidden="true" className="grid h-10 w-7 place-items-center bg-line/70 text-xs font-semibold text-muted">
      {title.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
