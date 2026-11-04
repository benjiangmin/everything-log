"use client";

import { useEffect, useState, useTransition } from "react";
import { addSeasons, seasonLookup, seasonStarts, type NewSeason, type SeasonStart } from "@/app/catalog-actions";
import type { SeasonNode } from "@/lib/catalog";
import { noteFor } from "./season-notes";

type Status = NewSeason["status"];
type Season = { node: SeasonNode; checked: boolean; status: Status; have: boolean }; // have = the card you already have
type Group = { start: SeasonStart; seasons: Season[]; noted: boolean };

const SERIES = new Set(["TV", "TV_SHORT", "ONA"]); // seasons; movies / OVAs / specials are left out
const GAP_MS = 2100; // AniList: ~30 requests a minute right now
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Slides in from the right: every show you've matched to AniList, with its other seasons.
// The ones your notes say you watched start ticked. Add them (each becomes its own card, right
// under the show's card) or skip.
export default function SeasonsPanel({ onClose }: { onClose: () => void }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [progress, setProgress] = useState("Loading…");
  const [error, setError] = useState<string | null>(null);
  const [unmatched, setUnmatched] = useState(false);
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    let live = true;
    (async () => {
      const res = await seasonStarts();
      if (!live) return;
      if (!res.ok) return setError(res.message);
      if (!res.starts.length) {
        setUnmatched(true);
        setGroups([]);
        return;
      }

      // Walk sequel / prequel links outward from every show at once, 50 shows per request.
      const known = new Map<number, SeasonNode>();
      let frontier = [...new Set(res.starts.map((s) => s.anilist))];
      for (let depth = 0; frontier.length && depth < 20 && known.size < 600 && live; depth++) {
        for (let i = 0; i < frontier.length && live; ) {
          setProgress(`Finding seasons… (${known.size} found)`);
          const found = await seasonLookup(frontier.slice(i, i + 50));
          if (!live) return;
          if (!found.ok) {
            if (!found.wait) return setError(found.message);
            setProgress(`Slowing down for ${found.wait}s (lookup limit)…`);
            await sleep(found.wait * 1000);
            continue;
          }
          for (const n of found.nodes) known.set(n.id, n);
          i += 50;
          await sleep(GAP_MS);
        }
        frontier = [...new Set([...known.values()].flatMap((n) => n.links))].filter((id) => !known.has(id));
      }
      if (!live) return;
      setGroups(buildGroups(res.starts, new Set(res.taken), known));
    })();
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function add(list: Group[]) {
    const payload = list
      .map((g) => ({
        afterId: g.start.id,
        seasons: g.seasons
          .filter((s) => s.checked && !s.have)
          .map((s) => ({
            status: s.status,
            match: { source_id: `anilist:${s.node.id}`, title: s.node.title, cover_url: s.node.cover_url, year: s.node.year, movie: false },
          })),
      }))
      .filter((g) => g.seasons.length);
    if (!payload.length) return;
    const ids = new Set(list.map((g) => g.start.id));
    setGroups((gs) => gs && gs.filter((g) => !ids.has(g.start.id)));
    startSaving(async () => {
      const res = await addSeasons(payload);
      if (!res.ok) setError(res.message ?? "Couldn't add.");
    });
  }

  const skip = (g: Group) => setGroups((gs) => gs && gs.filter((x) => x.start.id !== g.start.id));
  const toggle = (g: Group, id: number) =>
    setGroups(
      (gs) =>
        gs &&
        gs.map((x) => (x.start.id === g.start.id ? { ...x, seasons: x.seasons.map((s) => (s.node.id === id ? { ...s, checked: !s.checked } : s)) } : x)),
    );

  const count = (g: Group) => g.seasons.filter((s) => s.checked && !s.have).length;
  const ready = groups?.filter((g) => count(g) > 0) ?? [];
  const total = ready.reduce((n, g) => n + count(g), 0);
  const noted = groups?.filter((g) => g.noted) ?? [];
  const others = groups?.filter((g) => !g.noted) ?? [];

  return (
    <div className="fixed inset-0 z-[70]">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/30" />
      <aside aria-label="Add seasons" className="panel-slide absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-paper shadow-2xl shadow-ink/30">
        <header className="border-b border-line px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold">Add seasons</h2>
              <p className="text-sm text-muted" role="status">
                {error ? "" : groups === null ? progress : groups.length ? `${groups.length} shows with more seasons` : "Nothing to add"}
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
          {ready.length > 1 && (
            <button
              type="button"
              disabled={saving}
              onClick={() => add(ready)}
              className="mt-3 h-10 w-full rounded-control bg-accent font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              Add all {total} ticked seasons
            </button>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-gutter:stable] [scrollbar-width:thin]">
          {error && <p className="mb-3 rounded-card bg-surface px-4 py-3 text-sm text-danger">{error}</p>}
          {groups?.length === 0 && !error && (
            <p className="rounded-card border border-dashed border-line px-5 py-8 text-center text-muted">
              {unmatched ? "Match your shows first: Find covers (in the sidebar), then come back." : "Every season you have notes for is already here."}
            </p>
          )}
          <ul className="space-y-3">
            {noted.map((g) => (
              <ShowCard key={g.start.id} group={g} count={count(g)} onToggle={(id) => toggle(g, id)} onAdd={() => add([g])} onSkip={() => skip(g)} />
            ))}
          </ul>
          {others.length > 0 && (
            <>
              <h3 className="mb-1 mt-6 px-1 text-sm font-semibold text-muted">Not in your notes</h3>
              <p className="mb-3 px-1 text-xs text-muted">These have other seasons too. Tick any you&apos;ve watched.</p>
              <ul className="space-y-3">
                {others.map((g) => (
                  <ShowCard key={g.start.id} group={g} count={count(g)} onToggle={(id) => toggle(g, id)} onAdd={() => add([g])} onSkip={() => skip(g)} />
                ))}
              </ul>
            </>
          )}
          <div className="h-24" />
        </div>
      </aside>
    </div>
  );
}

// Each show: its seasons in order (the one you have included, greyed), ticked per your notes.
function buildGroups(starts: SeasonStart[], taken: Set<number>, known: Map<number, SeasonNode>): Group[] {
  const used = new Set<number>(); // a season goes under the first show that reaches it
  const groups: Group[] = [];
  for (const start of starts) {
    if (used.has(start.anilist)) continue;
    const chain = new Set<number>([start.anilist]);
    const queue = [start.anilist];
    while (queue.length) {
      const n = known.get(queue.shift()!);
      for (const l of n?.links ?? []) {
        if (chain.has(l) || !known.has(l)) continue;
        chain.add(l);
        queue.push(l);
      }
    }
    const note = noteFor(start.title);
    const all = [...chain]
      .map((id) => known.get(id)!)
      .filter((n) => n && n.id === start.anilist ? true : n && SERIES.has(n.format ?? "") && n.status !== "NOT_YET_RELEASED" && n.status !== "CANCELLED")
      .filter((n) => n.id === start.anilist || !note?.skip?.test(n.title))
      .sort((a, b) => a.start - b.start);
    const newest = all.length - 1;
    const base: Status = start.status === "playing" || start.status === "stopped" ? start.status : "completed";
    const seasons: Season[] = all.map((node, i) => {
      const have = node.id === start.anilist;
      const watched =
        !note ? false : note.rule === "upTo" ? i < (note.n ?? 1) : note.rule === "allButNewest" ? i < newest || newest === 0 : true;
      return {
        node,
        have,
        checked: have || watched,
        status: note?.rule === "droppedNewest" && i === newest && i > 0 ? "stopped" : base,
      };
    });
    for (const s of seasons) used.add(s.node.id);
    const extra = seasons.filter((s) => !s.have && !taken.has(s.node.id));
    if (!extra.length) continue;
    groups.push({ start, noted: Boolean(note), seasons: seasons.filter((s) => s.have || !taken.has(s.node.id)) });
  }
  return groups;
}

function ShowCard({
  group,
  count,
  onToggle,
  onAdd,
  onSkip,
}: {
  group: Group;
  count: number;
  onToggle: (id: number) => void;
  onAdd: () => void;
  onSkip: () => void;
}) {
  return (
    <li className="rounded-card bg-surface p-3">
      <p className="px-1 font-semibold leading-snug text-ink">{group.start.title}</p>
      <ul className="mt-2 space-y-1">
        {group.seasons.map((s) => (
          <li key={s.node.id}>
            <label
              className={`flex items-center gap-3 rounded-control px-1 py-1 transition-colors ${
                s.have ? "opacity-60" : "cursor-pointer hover:bg-paper"
              }`}
            >
              <input
                type="checkbox"
                checked={s.checked}
                disabled={s.have}
                onChange={() => onToggle(s.node.id)}
                className="size-4 shrink-0 accent-[var(--color-accent)]"
              />
              {s.node.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote cover
                <img src={s.node.cover_url} alt="" className="h-10 w-7 shrink-0 rounded-[4px] object-cover" />
              ) : (
                <span aria-hidden="true" className="h-10 w-7 shrink-0 rounded-[4px] bg-line/70" />
              )}
              <span className="min-w-0 flex-1 text-sm leading-snug text-ink">
                <span className="break-words">{s.node.title}</span>
                <span className="ml-1.5 text-xs text-muted">
                  {s.node.year ?? ""}
                  {s.have ? " · on your list" : s.status === "stopped" ? " · goes under Stopped" : s.node.status === "RELEASING" ? " · airing" : ""}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center gap-1">
        <button
          type="button"
          disabled={count === 0}
          onClick={onAdd}
          className="rounded-control bg-accent px-3.5 py-1.5 text-sm font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Add {count} {count === 1 ? "season" : "seasons"}
        </button>
        <button type="button" onClick={onSkip} className="ml-auto rounded-control px-3 py-1.5 text-sm text-muted transition-colors hover:bg-paper hover:text-ink">
          Skip
        </button>
      </div>
    </li>
  );
}
