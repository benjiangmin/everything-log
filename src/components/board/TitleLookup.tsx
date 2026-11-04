"use client";

import { useEffect, useRef, useState } from "react";
import { lookupTitles } from "@/app/catalog-actions";
import type { Match } from "@/lib/catalog";

// The title box on Games / Anime. As you type, matches from AniList / IGDB drop down with their
// covers. Pick one and the standard title + cover are saved with it; keep typing your own and it's
// saved as is (no cover). Also how an existing entry gets its cover: edit it and pick a match.
//
// Sends: title, cover_url, source_id (the last two empty for your own titles).
export default function TitleLookup({
  kind,
  defaultTitle = "",
  defaultCover = null,
  defaultSource = null,
  placeholder,
  maxLength,
  className,
  inputRef,
  resetKey,
  onPick,
}: {
  kind: "anime" | "game";
  defaultTitle?: string;
  defaultCover?: string | null;
  defaultSource?: string | null;
  placeholder: string;
  maxLength: number;
  className: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  resetKey?: number; // changes after adding one: empties the box
  onPick?: (m: Match) => void; // e.g. tick "It's a movie"
}) {
  const [text, setText] = useState(defaultTitle);
  const [picked, setPicked] = useState<{ title: string; cover: string | null; source: string | null } | null>(
    defaultSource ? { title: defaultTitle, cover: defaultCover, source: defaultSource } : null,
  );
  const [matches, setMatches] = useState<Match[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [searching, setSearching] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const typed = useRef(false); // only search after you type (not for an edit's saved title)

  // After adding: empty again.
  const [seenReset, setSeenReset] = useState(resetKey);
  if (resetKey !== seenReset) {
    setSeenReset(resetKey);
    setText("");
    setPicked(null);
    setMatches([]);
    setOpen(false);
  }

  // Look it up a moment after you stop typing.
  useEffect(() => {
    if (!typed.current) return;
    const q = text.trim();
    if (q.length < 2 || (picked && picked.title === text)) return;
    let live = true;
    const t = setTimeout(async () => {
      setSearching(true);
      const res = await lookupTitles(kind, q);
      if (!live) return;
      setSearching(false);
      if (res.ok) {
        setMatches(res.matches);
        setNote(null);
      } else {
        setMatches([]);
        setNote(res.message);
      }
      // Highlight the first one you can pick (not one already on your list).
      setActive(res.ok ? Math.max(0, res.matches.findIndex((m) => !m.have || m.source_id === defaultSource)) : 0);
      setOpen(true);
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [text, kind, picked, defaultSource]);

  // Clicking elsewhere closes the list.
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function pick(m: Match) {
    setText(m.title);
    setPicked({ title: m.title, cover: m.cover_url, source: m.source_id });
    setOpen(false);
    onPick?.(m);
  }

  // Already on your list (the one you're editing doesn't count): shown, but can't be picked.
  const taken = (m: Match) => Boolean(m.have) && m.source_id !== defaultSource;

  // Still the picked title? Then its cover goes with it; otherwise it's your own title.
  const match = picked && picked.title === text ? picked : null;

  return (
    <div ref={wrap} className="relative min-w-0 flex-1">
      <input type="hidden" name="cover_url" value={match?.cover ?? ""} />
      <input type="hidden" name="source_id" value={match?.source ?? ""} />
      <div className="relative">
        {match?.cover && (
          // eslint-disable-next-line @next/next/no-img-element -- remote cover thumbnail
          <img src={match.cover} alt="" className="pointer-events-none absolute left-2 top-1/2 h-8 w-6 -translate-y-1/2 rounded-[4px] object-cover" />
        )}
        <input
          ref={inputRef}
          name="title"
          required
          maxLength={maxLength}
          value={text}
          onChange={(e) => {
            typed.current = true;
            setText(e.target.value);
          }}
          onFocus={() => matches.length > 0 && !match && setOpen(true)}
          onKeyDown={(e) => {
            if (!open || matches.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (!taken(matches[active])) pick(matches[active]);
            } else if (e.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          autoComplete="off"
          style={{ outline: "none" }}
          className={`${className} ${match?.cover ? "pl-10" : ""} ${searching ? "pr-9" : ""}`}
        />
        {searching && (
          <span aria-hidden="true" className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin rounded-full border-2 border-line border-t-muted" />
        )}
      </div>

      {open && (
        <div className="panel-pop absolute left-0 right-0 top-full z-40 mt-1.5 overflow-hidden rounded-card border border-line bg-paper shadow-xl shadow-ink/15">
          {matches.length > 0 ? (
            <ul className="max-h-80 overflow-y-auto p-1.5 [scrollbar-width:thin]">
              {matches.map((m, i) => (
                <li key={m.source_id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()} // keep focus in the box
                    disabled={taken(m)}
                    onClick={() => pick(m)}
                    onMouseMove={() => setActive(i)}
                    className={`flex w-full items-center gap-3 rounded-control px-2 py-1.5 text-left ${
                      taken(m) ? "cursor-default [&>img]:opacity-45 [&>span:first-of-type]:opacity-55" : i === active ? "bg-surface" : ""
                    }`}
                  >
                    {m.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- remote cover thumbnail
                      <img src={m.cover_url} alt="" className="h-12 w-9 shrink-0 rounded-[5px] object-cover" loading="lazy" />
                    ) : (
                      <span className="h-12 w-9 shrink-0 rounded-[5px] bg-line" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{m.title}</span>
                      <span className="block text-xs text-muted">
                        {[m.year, m.movie ? "Movie" : null].filter(Boolean).join(" · ") || " "}
                      </span>
                    </span>
                    {taken(m) && (
                      <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-ink/70">Already in {m.have}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm text-muted">{note ?? `No matches. "${text.trim()}" will be added as your own.`}</p>
          )}
          {matches.length > 0 && (
            <p className="border-t border-line px-4 py-2 text-xs text-muted">Not here? Just keep typing and add it as your own.</p>
          )}
        </div>
      )}
    </div>
  );
}
