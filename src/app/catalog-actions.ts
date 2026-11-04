"use server";

import { igdbReady, searchAniList, searchIGDB, type Match } from "@/lib/catalog";

// The title box's suggestions on Games / Anime. Never throws: no matches = add your own title.
export type Lookup = { ok: true; matches: Match[] } | { ok: false; message: string };

export async function lookupTitles(kind: "anime" | "game", q: string): Promise<Lookup> {
  const query = q.trim();
  if (query.length < 2) return { ok: true, matches: [] };
  try {
    if (kind === "anime") return { ok: true, matches: await searchAniList(query) };
    if (!igdbReady()) return { ok: false, message: "Game search isn't set up yet (needs the Twitch keys)." };
    return { ok: true, matches: await searchIGDB(query) };
  } catch (e) {
    return { ok: false, message: `Couldn't search: ${(e as Error).message}` };
  }
}
