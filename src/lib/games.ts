import "server-only";
import { db } from "./supabase";
import { byQueue, byRecent } from "./games-sort";

export const STATUSES = ["playing", "completed", "stopped", "backlog"] as const;
export type GameStatus = (typeof STATUSES)[number];

export type Game = {
  id: string;
  title: string;
  status: GameStatus;
  started_on: string | null; // "YYYY-MM-DD"
  finished_on: string | null;
  note: string | null;
  position: number;
  cover_url: string | null; // from IGDB
  source_id: string | null;
};

const BASE = "id, title, status, started_on, finished_on, note, position";
const COLUMNS = `${BASE}, cover_url, source_id`;

export async function getGames(): Promise<Record<GameStatus, Game[]>> {
  let res = await db().from("games").select(COLUMNS);
  if (res.error) res = await db().from("games").select(BASE); // supabase/covers.sql not run yet
  const { data, error } = res;
  if (error) throw new Error(`Couldn't load games: ${error.message}`);
  const out: Record<GameStatus, Game[]> = { playing: [], completed: [], stopped: [], backlog: [] };
  for (const g of data as Game[]) out[g.status]?.push(g);
  out.playing.sort(byRecent);
  out.completed.sort(byRecent);
  out.stopped.sort(byRecent);
  out.backlog.sort(byQueue); // backlog keeps its queue order
  return out;
}

export async function searchGames(query: string, limit = 25): Promise<{ results: Game[]; total: number }> {
  const safe = query.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const { data, error, count } = await db()
    .from("games")
    .select(COLUMNS, { count: "exact" })
    .ilike("search_text", `%${safe}%`)
    .order("position", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Search failed: ${error.message}`);
  return { results: data as Game[], total: count ?? data.length };
}
