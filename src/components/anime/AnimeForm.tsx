"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addAnime, updateAnime, type FormState } from "@/app/anime/actions";
import type { Anime, AnimeStatus } from "@/lib/anime";
import SelectPicker from "@/components/ui/SelectPicker";
import { ANIME_LABELS } from "./labels";
import AddBox from "@/components/board/AddBox";
import TitleLookup from "@/components/board/TitleLookup";

const initial: FormState = { ok: false, message: null };
const field =
  "w-full rounded-control border border-line bg-paper px-3 py-2.5 text-ink placeholder:text-muted/70 focus:border-ink";
const ORDER: AnimeStatus[] = ["playing", "completed", "stopped", "backlog"];

// "Add an anime" (top of the page), also used to edit one inside its card (pass `anime` + compact).
export default function AnimeForm({ anime, onDone, compact }: { anime?: Anime; onDone?: () => void; compact?: boolean }) {
  const editing = Boolean(anime);
  const [state, action, pending] = useActionState(editing ? updateAnime : addAnime, initial);
  const [status, setStatus] = useState<AnimeStatus>(anime?.status ?? "playing");
  const [isMovie, setIsMovie] = useState(anime?.is_movie ?? false); // ticks itself when you pick a movie
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!state.ok) return;
    if (editing) return onDone?.();
    const form = formRef.current;
    const el = form?.elements.namedItem("note") as HTMLInputElement | null;
    if (el) el.value = "";
    titleRef.current?.focus();
  }, [state.ok, state.savedAt, editing, onDone]);

  // After adding, the Movie toggle switches back off.
  const [seenSave, setSeenSave] = useState(state.savedAt);
  if (state.savedAt !== seenSave) {
    setSeenSave(state.savedAt);
    if (state.ok && !editing) setIsMovie(false);
  }

  // Type to search AniList: picking one fills in its English title + cover (and ticks Movie).
  const title = (
    <TitleLookup
      kind="anime"
      inputRef={titleRef}
      resetKey={editing ? undefined : state.savedAt}
      defaultTitle={anime?.title}
      defaultCover={anime?.cover_url}
      defaultSource={anime?.source_id}
      maxLength={150}
      placeholder="Anime"
      onPick={(m) => setIsMovie(Boolean(m.movie))}
      className={`${field} min-w-0`}
    />
  );
  const picker = (
    <div className={compact ? "" : "w-36 shrink-0 sm:w-44"}>
      <SelectPicker<AnimeStatus>
        label="Status"
        value={status}
        options={ORDER.map((s) => ({ value: s, label: ANIME_LABELS[s] }))}
        onChange={setStatus}
      />
    </div>
  );
  const note = (
    <input
      name="note"
      maxLength={500}
      defaultValue={anime?.note ?? ""}
      placeholder="Note (optional)"
      aria-label="Note"
      style={{ outline: "none" }}
      className={`${field} min-w-0`}
    />
  );
  const movie = (
    <label className="flex cursor-pointer items-center gap-2 px-1 text-sm text-muted">
      <input type="checkbox" name="is_movie" checked={isMovie} onChange={(e) => setIsMovie(e.target.checked)} className="size-4 accent-[var(--accent)]" />
      It&apos;s a movie
    </label>
  );

  // The add box at the top of the page: a Movie toggle on the left | title + status, note | + button.
  if (!compact) {
    return (
      <form ref={formRef} action={action}>
        <input type="hidden" name="status" value={status} />
        <AddBox
          label="Add anime"
          pending={pending}
          message={state.message}
          narrowSide
          // Keyed on the last save, so it switches back off after adding.
          side={<MovieToggle isMovie={isMovie} setIsMovie={setIsMovie} />}
          rows={
            <>
              {/* No status picker when adding: New anime start in Watching (drag it on the board to change). */}
              <div className="flex">{title}</div>
              {note}
            </>
          }
        />
      </form>
    );
  }

  // Editing inside a card: everything stacked.
  return (
    <form ref={formRef} action={action} className="flex flex-col gap-2">
      {anime && <input type="hidden" name="id" value={anime.id} />}
      <input type="hidden" name="status" value={status} />
      {title}
      {picker}
      {note}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {movie}
        <div className="flex w-full items-center justify-end gap-1.5">
          {state.message && (
            <p role="status" className="text-sm text-danger">
              {state.message}
            </p>
          )}
          <button
            type="button"
            onClick={onDone}
            className="rounded-control px-3 py-2.5 text-sm text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-control bg-accent px-5 py-2.5 font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </form>
  );
}

// The add box's Movie switch: a small tile with a film icon. On = filled coffee.
function MovieToggle({ isMovie, setIsMovie }: { isMovie: boolean; setIsMovie: (f: (m: boolean) => boolean) => void }) {
  return (
    <>
      {isMovie && <input type="hidden" name="is_movie" value="on" />}
      <button
        type="button"
        aria-pressed={isMovie}
        onClick={() => setIsMovie((m) => !m)}
        title={isMovie ? "It's a movie" : "Mark as a movie"}
        className={`flex w-full flex-col items-center justify-center gap-1 rounded-control px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wide transition-colors sm:h-full sm:w-16 ${
          isMovie ? "bg-accent/15 text-accent ring-1 ring-accent/50" : "border border-dashed border-muted/50 text-muted hover:border-muted hover:text-ink"
        }`}
      >
        {/* A film strip. */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8 3v18M16 3v18M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        Movie
      </button>
    </>
  );
}
