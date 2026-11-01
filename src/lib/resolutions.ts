import "server-only";
import { db } from "./supabase";

export type Resolution = { id: string; year: number; title: string; reflection: string | null; position: number };

const COLUMNS = "id, year, title, reflection, position";

// One year's resolutions (in the order written), its note, and how many the year before had
// (so an empty year can offer to copy them over).
export async function getResolutionYear(year: number): Promise<{ items: Resolution[]; note: string | null; lastYearCount: number }> {
  const [items, note, last] = await Promise.all([
    db().from("resolutions").select(COLUMNS).eq("year", year).order("position").order("created_at"),
    db().from("resolution_years").select("note").eq("year", year).maybeSingle(),
    db().from("resolutions").select("id", { count: "exact", head: true }).eq("year", year - 1),
  ]);
  if (items.error) throw new Error(`Couldn't load resolutions: ${items.error.message}`);
  return { items: items.data, note: note.data?.note ?? null, lastYearCount: last.count ?? 0 };
}

// Case-insensitive "contains" search across every year (resolutions and how they went), newest first.
export async function searchResolutions(query: string, limit = 25): Promise<{ results: Resolution[]; total: number }> {
  const safe = query.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const { data, error, count } = await db()
    .from("resolutions")
    .select(COLUMNS, { count: "exact" })
    .ilike("search_text", `%${safe}%`)
    .order("year", { ascending: false })
    .order("position")
    .limit(limit);
  if (error) throw new Error(`Search failed: ${error.message}`);
  return { results: data, total: count ?? data.length };
}
