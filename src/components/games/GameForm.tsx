"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addGame, updateGame, type FormState } from "@/app/games/actions";
import type { Game, GameStatus } from "@/lib/games";
import SelectPicker from "@/components/ui/SelectPicker";
import OptionalDate from "./OptionalDate";
import AddBox from "@/components/board/AddBox";
import TitleLookup from "@/components/board/TitleLookup";

const initial: FormState = { ok: false, message: null };

export const STATUS_LABELS: Record<GameStatus, string> = {
  playing: "Playing",
  completed: "Completed",
  stopped: "Stopped playing",
  backlog: "Backlog",
};

const field =
  "w-full rounded-control border border-line bg-paper px-3 py-2.5 text-ink placeholder:text-muted/70 focus:border-ink";

// "Add a game" (pinned at the top), also used to edit one (pass `game`).
// compact: stacked layout, for editing inside a card.
export default function GameForm({ game, onDone, compact }: { game?: Game; onDone?: () => void; compact?: boolean }) {
  const editing = Boolean(game);
  const [state, action, pending] = useActionState(editing ? updateGame : addGame, initial);
  const [status, setStatus] = useState<GameStatus>(game?.status ?? "playing");
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

  // Type to search IGDB: picking one fills in its standard title + cover.
  const title = (
    <TitleLookup
      kind="game"
      inputRef={titleRef}
      resetKey={editing ? undefined : state.savedAt}
      defaultTitle={game?.title}
      defaultCover={game?.cover_url}
      defaultSource={game?.source_id}
      maxLength={120}
      placeholder="Game"
      className={`${field} min-w-0`}
    />
  );
  const picker = (
    <div className={compact ? "" : "w-36 shrink-0 sm:w-44"}>
      <SelectPicker<GameStatus>
        label="Status"
        value={status}
        options={(Object.keys(STATUS_LABELS) as GameStatus[]).map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
        onChange={setStatus}
      />
    </div>
  );
  const note = (
    <input
      name="note"
      maxLength={500}
      defaultValue={game?.note ?? ""}
      placeholder="Note (optional)"
      aria-label="Note"
      style={{ outline: "none" }}
      className={`${field} min-w-0`}
    />
  );

  // The add box at the top of the page: dates on the left | title + status, note | + button.
  if (!compact) {
    return (
      <form ref={formRef} action={action}>
        <input type="hidden" name="status" value={status} />
        <AddBox
          label="Add game"
          pending={pending}
          message={state.message}
          // Keyed on the last save time, so the dates reset after adding a game.
          side={
            <div key={state.savedAt ?? 0} className="contents">
              <OptionalDate name="started_on" label="Start" defaultValue={game?.started_on ?? null} block />
              <OptionalDate name="finished_on" label="End" defaultValue={game?.finished_on ?? null} block />
            </div>
          }
          rows={
            <>
              {/* No status picker when adding: New games start in In progress (drag it on the board to change). */}
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
      {game && <input type="hidden" name="id" value={game.id} />}
      <input type="hidden" name="status" value={status} />
      {title}
      {picker}
      {note}
      <div key="edit" className="flex flex-wrap items-center gap-2 text-sm">
        <OptionalDate name="started_on" label="Start" defaultValue={game?.started_on ?? null} />
        <span className="text-muted/60" aria-hidden="true">→</span>
        <OptionalDate name="finished_on" label="End" defaultValue={game?.finished_on ?? null} />
        <div className="flex w-full items-center justify-end gap-1.5">
          {state.message && (
            <p role="status" className="text-sm text-danger">
              {state.message}
            </p>
          )}
          {editing && (
            <button
              type="button"
              onClick={onDone}
              className="rounded-control px-3 py-2.5 text-sm text-muted transition-colors hover:bg-paper hover:text-ink"
            >
              Cancel
            </button>
          )}
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
