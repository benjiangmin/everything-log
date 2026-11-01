import "server-only";
import { db } from "./supabase";

export type PersonItem = { id: string; body: string; pinned: boolean; position: number };

const COLUMNS = "id, body, pinned, position";

// In the order added (oldest at the top, newest at the bottom).
export async function getPersonItems(): Promise<PersonItem[]> {
  const { data, error } = await db().from("person_items").select(COLUMNS).order("position");
  if (error) throw new Error(`Couldn't load the list: ${error.message}`);
  return data as PersonItem[];
}

export async function searchPerson(query: string, limit = 25): Promise<{ results: PersonItem[]; total: number }> {
  const safe = query.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const { data, error, count } = await db()
    .from("person_items")
    .select(COLUMNS, { count: "exact" })
    .ilike("search_text", `%${safe}%`)
    .order("position")
    .limit(limit);
  if (error) throw new Error(`Search failed: ${error.message}`);
  return { results: data as PersonItem[], total: count ?? data.length };
}
