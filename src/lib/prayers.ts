import "server-only";
import { db } from "./supabase";
import { cleanDreamHtml, htmlToText } from "./dream-html";

export type Prayer = { id: string; title: string | null; prayed_on: string | null; body: string; position: number };

const COLUMNS = "id, title, prayed_on, body, position";

// Newest written first. Bodies cleaned to safe HTML.
export async function getPrayers(): Promise<Prayer[]> {
  const { data, error } = await db().from("prayers").select(COLUMNS).order("position", { ascending: false });
  if (error) throw new Error(`Couldn't load prayers: ${error.message}`);
  return (data as Prayer[]).map((p) => ({ ...p, body: cleanDreamHtml(p.body) }));
}

export type PrayerHit = Prayer & { snippet: string };

export async function searchPrayers(query: string, limit = 25): Promise<{ results: PrayerHit[]; total: number }> {
  const safe = query.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const { data, error, count } = await db()
    .from("prayers")
    .select(COLUMNS, { count: "exact" })
    .ilike("search_text", `%${safe}%`)
    .order("position", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Search failed: ${error.message}`);
  const q = query.toLowerCase();
  const results = (data as Prayer[]).map((p) => {
    const text = htmlToText(p.body);
    const at = Math.max(0, text.toLowerCase().indexOf(q));
    const from = Math.max(0, at - 30);
    return { ...p, snippet: (from > 0 ? "…" : "") + text.slice(from, from + 120) };
  });
  return { results, total: count ?? results.length };
}
