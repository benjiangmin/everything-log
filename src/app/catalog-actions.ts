"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { whereOnList } from "@/lib/duplicates";
import {
  aniListSeasons,
  igdbReady,
  RateLimited,
  safeCover,
  safeSourceId,
  searchAniList,
  searchAniListMany,
  searchIGDB,
  searchIGDBMany,
  type Match,
  type SeasonNode,
} from "@/lib/catalog";

type Kind = "anime" | "game";
const table = (kind: Kind) => (kind === "anime" ? "anime" : "games");
const page = (kind: Kind) => (kind === "anime" ? "/anime" : "/games");
const isUuid = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id);
const notReady = "Game search isn't set up yet (needs the Twitch keys).";

// The title box's suggestions on Games / Anime. Never throws: no matches = add your own title.
export type Lookup = { ok: true; matches: Match[] } | { ok: false; message: string };

export async function lookupTitles(kind: Kind, q: string): Promise<Lookup> {
  const query = q.trim();
  if (query.length < 2) return { ok: true, matches: [] };
  try {
    if (kind === "game" && !igdbReady()) return { ok: false, message: notReady };
    const matches = kind === "anime" ? await searchAniList(query) : await searchIGDB(query);
    // Already on your list? The dropdown says where (and won't let you add it again).
    const have = await whereOnList(table(kind), matches.map((m) => m.source_id));
    return { ok: true, matches: matches.map((m) => (have.has(m.source_id) ? { ...m, have: have.get(m.source_id) } : m)) };
  } catch (e) {
    return { ok: false, message: `Couldn't search: ${(e as Error).message}` };
  }
}

// ---------- Find covers: matching titles you added before search existed ----------

export type Unmatched = { id: string; title: string };

// Everything without a match yet (and not marked "keep mine"), oldest first.
export async function unmatchedTitles(kind: Kind): Promise<{ ok: true; items: Unmatched[] } | { ok: false; message: string }> {
  if (kind === "game" && !igdbReady()) return { ok: false, message: notReady };
  const { data, error } = await db().from(table(kind)).select("id, title").is("source_id", null).order("position", { ascending: true });
  if (error) {
    return {
      ok: false,
      message: /source_id/.test(error.message) ? "Run supabase/covers.sql in Supabase first." : `Couldn't load: ${error.message}`,
    };
  }
  return { ok: true, items: data as Unmatched[] };
}

// Top matches for a batch of titles (anime: up to 8 per call, games: 10).
// wait: AniList/IGDB asked us to slow down, try again after this many seconds.
export async function suggestMatches(
  kind: Kind,
  titles: string[],
): Promise<{ ok: true; matches: Match[][] } | { ok: false; message: string; wait?: number }> {
  const list = titles.slice(0, kind === "anime" ? 8 : 10).map((t) => String(t).trim().slice(0, 150));
  try {
    if (kind === "anime") return { ok: true, matches: await searchAniListMany(list) };
    if (!igdbReady()) return { ok: false, message: notReady };
    return { ok: true, matches: await searchIGDBMany(list) };
  } catch (e) {
    if (e instanceof RateLimited) return { ok: false, message: e.message, wait: e.wait };
    return { ok: false, message: `Couldn't search: ${(e as Error).message}` };
  }
}

export type Choice = { id: string; match: Match | null }; // null = keep my own title, stop asking

// Saves picks: the standard title + cover (and for anime, whether it's a movie).
export async function applyMatches(kind: Kind, choices: Choice[]): Promise<{ ok: boolean; message?: string }> {
  for (const c of choices.slice(0, 200)) {
    if (!isUuid(c.id)) continue;
    let values: Record<string, unknown>;
    if (!c.match) {
      values = { source_id: "none" };
    } else {
      const source_id = safeSourceId(c.match.source_id);
      const title = String(c.match.title ?? "").trim().slice(0, 150);
      if (!source_id || source_id === "none" || !title) continue;
      values = { title, source_id, cover_url: safeCover(c.match.cover_url) };
      if (kind === "anime" && typeof c.match.movie === "boolean") values.is_movie = c.match.movie;
    }
    const { error } = await db().from(table(kind)).update(values).eq("id", c.id);
    if (error) return { ok: false, message: `Couldn't save: ${error.message}` };
  }
  revalidatePath(page(kind));
  return { ok: true };
}

// ---------- Add seasons (anime): one card per season ----------

export type SeasonStart = { id: string; title: string; status: string; anilist: number };

// Shows already matched to AniList (not movies), top of the list first, plus every AniList id
// you already have (so nothing gets added twice).
export async function seasonStarts(): Promise<{ ok: true; starts: SeasonStart[]; taken: number[] } | { ok: false; message: string }> {
  const { data, error } = await db().from("anime").select("id, title, status, is_movie, source_id").order("position", { ascending: false });
  if (error) {
    return { ok: false, message: /source_id/.test(error.message) ? "Run supabase/covers.sql in Supabase first." : `Couldn't load: ${error.message}` };
  }
  const rows = (data as { id: string; title: string; status: string; is_movie: boolean; source_id: string | null }[]).map((r) => ({
    ...r,
    anilist: /^anilist:(\d+)$/.exec(r.source_id ?? "")?.[1],
  }));
  return {
    ok: true,
    starts: rows.filter((r) => r.anilist && !r.is_movie).map((r) => ({ id: r.id, title: r.title, status: r.status, anilist: Number(r.anilist) })),
    taken: rows.filter((r) => r.anilist).map((r) => Number(r.anilist)),
  };
}

export async function seasonLookup(ids: number[]): Promise<{ ok: true; nodes: SeasonNode[] } | { ok: false; message: string; wait?: number }> {
  const clean = ids.filter((n) => Number.isInteger(n) && n > 0).slice(0, 50);
  try {
    return { ok: true, nodes: await aniListSeasons(clean) };
  } catch (e) {
    if (e instanceof RateLimited) return { ok: false, message: e.message, wait: e.wait };
    return { ok: false, message: `Couldn't look up seasons: ${(e as Error).message}` };
  }
}

export type NewSeason = { match: Match; status: "completed" | "playing" | "stopped" };

// Adds seasons as their own cards, in order, right under the show's card.
export async function addSeasons(groups: { afterId: string; seasons: NewSeason[] }[]): Promise<{ ok: boolean; message?: string }> {
  const { data, error } = await db().from("anime").select("id, position, source_id").order("position", { ascending: false });
  if (error) return { ok: false, message: `Couldn't load: ${error.message}` };
  const rows = data as { id: string; position: number; source_id: string | null }[];
  const taken = new Set(rows.map((r) => r.source_id));

  // The new order (top of the list first), with the new seasons slotted in.
  const order: ({ id: string } | { insert: Record<string, unknown> })[] = rows.map((r) => ({ id: r.id }));
  for (const g of groups.slice(0, 100)) {
    if (!isUuid(g.afterId)) continue;
    const at = order.findIndex((o) => "id" in o && o.id === g.afterId);
    if (at < 0) continue;
    const inserts = g.seasons.slice(0, 30).flatMap((s) => {
      const source_id = safeSourceId(s.match?.source_id);
      const title = String(s.match?.title ?? "").trim().slice(0, 150);
      if (!source_id?.startsWith("anilist:") || !title || taken.has(source_id)) return [];
      if (!["completed", "playing", "stopped"].includes(s.status)) return [];
      taken.add(source_id);
      return [{ insert: { title, status: s.status, is_movie: false, note: null, source_id, cover_url: safeCover(s.match.cover_url) } }];
    });
    order.splice(at + 1, 0, ...inserts);
  }

  // Positions count down from the top, so nothing else moves around.
  const top = order.length - 1;
  const fresh = order.flatMap((o, i) => ("insert" in o ? [{ ...o.insert, position: top - i }] : []));
  if (!fresh.length) return { ok: true };
  const moves = order.flatMap((o, i) => ("id" in o && rows.find((r) => r.id === o.id)!.position !== top - i ? [{ id: o.id, position: top - i }] : []));
  for (let i = 0; i < moves.length; i += 20) {
    const results = await Promise.all(moves.slice(i, i + 20).map((m) => db().from("anime").update({ position: m.position }).eq("id", m.id)));
    const bad = results.find((r) => r.error);
    if (bad?.error) return { ok: false, message: `Couldn't reorder: ${bad.error.message}` };
  }
  const ins = await db().from("anime").insert(fresh);
  if (ins.error) return { ok: false, message: `Couldn't add: ${ins.error.message}` };
  revalidatePath("/anime");
  return { ok: true };
}
