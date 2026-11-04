import "server-only";
import { db } from "./supabase";

export type AnimeStatus = "playing" | "completed" | "stopped" | "backlog";
export type Anime = {
  id: string;
  title: string;
  status: AnimeStatus;
  is_movie: boolean;
  note: string | null;
  position: number;
  cover_url: string | null; // from AniList
  source_id: string | null;
};

const BASE = "id, title, status, is_movie, note, position";
const COLUMNS = `${BASE}, cover_url, source_id`;

// Newest added first; Plan to watch keeps its queue order (oldest first).
export const animeSort = (status: string) =>
  status === "backlog" ? (a: Anime, b: Anime) => a.position - b.position : (a: Anime, b: Anime) => b.position - a.position;

export async function getAnime(): Promise<Record<AnimeStatus, Anime[]>> {
  let res = await db().from("anime").select(COLUMNS);
  if (res.error) res = await db().from("anime").select(BASE); // supabase/covers.sql not run yet
  const { data, error } = res;
  if (error) throw new Error(`Couldn't load anime: ${error.message}`);
  const out: Record<AnimeStatus, Anime[]> = { playing: [], completed: [], stopped: [], backlog: [] };
  for (const a of data as Anime[]) out[a.status]?.push(a);
  for (const s of Object.keys(out) as AnimeStatus[]) out[s].sort(animeSort(s));
  return out;
}

export async function searchAnime(query: string, limit = 25): Promise<{ results: Anime[]; total: number }> {
  const safe = query.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const { data, error, count } = await db()
    .from("anime")
    .select(COLUMNS, { count: "exact" })
    .ilike("search_text", `%${safe}%`)
    .order("position", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Search failed: ${error.message}`);
  return { results: data as Anime[], total: count ?? data.length };
}
