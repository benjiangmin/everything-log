"use client";

import { deleteGame, moveGame } from "@/app/games/actions";
import type { Game, GameStatus } from "@/lib/games";
import { sorterFor } from "@/lib/games-sort";
import Board, { type BoardConfig } from "@/components/board/Board";
import GameForm from "./GameForm";
import { gameDates } from "./dates";

// The games board: the shared Board, with games' labels, dates and mascots.
const config: BoardConfig<Game> = {
  id: "games-board",
  labels: { completed: "Completed", playing: "In progress", stopped: "Stopped playing", backlog: "Backlog" },
  emptyBottomRow: "Nothing in the backlog. Drag a game here to save it for later.",
  sort: (status) => sorterFor(status),
  cover: (g) => g.cover_url ?? null,
  // Left date "8/11/26": when you started (in progress), otherwise when it ended.
  leftDate: (g) => {
    const d = g.status === "playing" ? (g.started_on ?? g.finished_on) : (g.finished_on ?? g.started_on);
    if (!d) return null;
    const [y, m, day] = d.split("-").map(Number);
    return `${m}/${day}/${String(y).slice(2)}`;
  },
  detail: (g) => gameDates(g.status, g.started_on, g.finished_on),
  // Dropping into In progress / Completed fills in today's date if there isn't one (same rule as the server).
  moved: (g, to, today) => ({
    ...g,
    status: to,
    started_on: to === "playing" && !g.started_on ? today : g.started_on,
    finished_on: to === "completed" && !g.finished_on ? today : g.finished_on,
    position: to === "backlog" ? Number.MAX_SAFE_INTEGER : g.position,
  }),
  onMove: (g, to, today) => moveGame(g.id, to, today),
  onDelete: (g) => deleteGame(g.id),
  editor: (g, done) => <GameForm game={g} compact onDone={done} />,
  // Porygon in Completed's bottom-left, Rotom in Stopped playing's bottom-right.
  // Tweak: w-.. = size, bottom/left/right = position (negative = past the edge), rotate-.. = tilt.
  mascots: {
    completed: { src: "/porygon.png", className: "-bottom-4 -left-6 w-32 rotate-6 lg:w-40" },
    stopped: { src: "/rotom.png", className: "-bottom-4 -right-6 w-28 -rotate-6 lg:w-36" },
  },
};

export default function GameBoard({ games, focusId }: { games: Record<GameStatus, Game[]>; focusId?: string }) {
  return <Board items={games} focusId={focusId} config={config} />;
}
