"use client";

import { deleteAnime, moveAnime } from "@/app/anime/actions";
import type { Anime, AnimeStatus } from "@/lib/anime";
import Board, { type BoardConfig } from "@/components/board/Board";
import AnimeForm from "./AnimeForm";
import { ANIME_LABELS } from "./labels";

// Same ordering as the server: newest added first; Plan to watch keeps its queue order.
const sort = (status: string) =>
  status === "backlog" ? (a: Anime, b: Anime) => a.position - b.position : (a: Anime, b: Anime) => b.position - a.position;

// The anime board: the shared Board, with no dates and a "Movie" tag.
const config: BoardConfig<Anime> = {
  id: "anime-board",
  labels: ANIME_LABELS,
  emptyBottomRow: "Nothing planned. Drag something here to watch later.",
  sort,
  tag: (a) => (a.is_movie ? "Movie" : null),
  cover: (a) => a.cover_url ?? null,
  moved: (a, to) => ({ ...a, status: to, position: to === "backlog" ? Number.MAX_SAFE_INTEGER : a.position }),
  onMove: (a, to) => moveAnime(a.id, to),
  onDelete: (a) => deleteAnime(a.id),
  editor: (a, done) => <AnimeForm anime={a} compact onDone={done} />,
  // Mascots sit behind the cards. className = where (bottom/right offsets), size (w-), tilt (rotate-).
  mascots: {
    playing: { src: "/slaking.png", className: "-bottom-3 -left-3 w-36 lg:w-44" },
    stopped: { src: "/snorlax.png", className: "-bottom-3 -right-4 w-36 lg:w-44" },
  },
};

export default function AnimeBoard({ anime, focusId }: { anime: Record<AnimeStatus, Anime[]>; focusId?: string }) {
  return <Board items={anime} focusId={focusId} config={config} />;
}
