import "server-only";
import { db } from "./supabase";

// Stops the same anime / game going on the list twice (picked from search, or typed by hand).

export const LIST_LABELS = {
  anime: { completed: "Completed", playing: "Watching", stopped: "Dropped", backlog: "Plan to watch" },
  games: { completed: "Completed", playing: "In progress", stopped: "Stopped playing", backlog: "Backlog" },
} as const;

type Table = keyof typeof LIST_LABELS;
const label = (table: Table, status: string) => LIST_LABELS[table][status as keyof (typeof LIST_LABELS)[Table]] ?? status;

// For the search dropdown: which of these matches are already on the list → where they are.
export async function whereOnList(table: Table, sourceIds: string[]): Promise<Map<string, string>> {
  if (!sourceIds.length) return new Map();
  const { data, error } = await db().from(table).select("source_id, status").in("source_id", sourceIds);
  if (error) return new Map(); // covers.sql not run yet: nothing to compare
  return new Map((data as { source_id: string; status: string }[]).map((r) => [r.source_id, label(table, r.status)]));
}

// Before saving: an error message if it's already there (same match, or the same title).
export async function duplicateMessage(
  table: Table,
  { title, source_id }: { title: string; source_id: string | null },
  excludeId?: string,
): Promise<string | null> {
  const safe = title.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  let q = db().from(table).select("title, status").ilike("title", safe).limit(1);
  if (excludeId) q = q.neq("id", excludeId);
  let found = (await q).data?.[0] as { title: string; status: string } | undefined;
  if (!found && source_id && source_id !== "none") {
    let s = db().from(table).select("title, status").eq("source_id", source_id).limit(1);
    if (excludeId) s = s.neq("id", excludeId);
    found = (await s).data?.[0] as { title: string; status: string } | undefined;
  }
  return found ? `"${found.title}" is already on your list (${label(table, found.status)}).` : null;
}
