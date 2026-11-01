import "server-only";
import { db } from "./supabase";
import { focusHref } from "./home-pages";

export type FocusLog = { id: string; area_id: string; entry_date: string; log: string; notes: string | null };
export type FocusArea = { id: string; name: string; goal: string | null; position: number; logs: FocusLog[] };

const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export async function focusRecordExists(id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const { data } = await db().from("focus_records").select("id").eq("id", id).maybeSingle();
  return Boolean(data);
}

// What the record's card on the home page is called ("Summer 2025").
export async function getFocusName(id: string): Promise<string | null> {
  const { data } = await db().from("home_items").select("name").eq("href", focusHref(id)).limit(1).maybeSingle();
  return data?.name ?? null;
}

// Every focus area (in the order added) with its logs, newest day first.
export async function getFocusAreas(recordId: string): Promise<FocusArea[]> {
  const areas = await db().from("focus_areas").select("id, name, goal, position").eq("record_id", recordId).order("position").order("created_at");
  if (areas.error) throw new Error(`Couldn't load focus areas: ${areas.error.message}`);
  if (areas.data.length === 0) return [];
  const logs = await db()
    .from("focus_logs")
    .select("id, area_id, entry_date, log, notes")
    .in("area_id", areas.data.map((a) => a.id))
    .order("entry_date", { ascending: false });
  if (logs.error) throw new Error(`Couldn't load logs: ${logs.error.message}`);
  return areas.data.map((a) => ({ ...a, logs: (logs.data as FocusLog[]).filter((l) => l.area_id === a.id) }));
}

export type FocusHit = FocusLog & { area: string };

// Search this record's logs and notes, newest first.
export async function searchFocus(recordId: string, query: string, limit = 30): Promise<{ results: FocusHit[]; total: number }> {
  if (!isUuid(recordId)) return { results: [], total: 0 };
  const areas = await db().from("focus_areas").select("id, name").eq("record_id", recordId);
  if (areas.error) throw new Error(`Search failed: ${areas.error.message}`);
  if (areas.data.length === 0) return { results: [], total: 0 };
  const names = new Map(areas.data.map((a) => [a.id as string, a.name as string]));
  const safe = query.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const { data, error, count } = await db()
    .from("focus_logs")
    .select("id, area_id, entry_date, log, notes", { count: "exact" })
    .in("area_id", [...names.keys()])
    .ilike("search_text", `%${safe}%`)
    .order("entry_date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Search failed: ${error.message}`);
  return { results: (data as FocusLog[]).map((l) => ({ ...l, area: names.get(l.area_id) ?? "" })), total: count ?? data.length };
}
