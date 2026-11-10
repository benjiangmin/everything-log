import "server-only";
import { db } from "./supabase";
import { TIME_ZONE } from "./month";

// The home page's todo list (supabase/todos.sql).

export type Todo = { id: string; html: string; done: boolean; done_at: string | null; position: number };

// Today as "YYYY-MM-DD" in your time zone.
export function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

// Unchecked first (in order), then checked ones (in the order they were checked). Checked ones
// from an earlier day are deleted first: "at the end of the day".
export async function getTodos(): Promise<Todo[] | "missing"> {
  const client = db();
  const cleared = await client.from("todos").delete().eq("done", true).lt("done_on", todayKey());
  if (cleared.error) return cleared.error.code === "42P01" || /todos/.test(cleared.error.message) ? "missing" : [];
  const { data, error } = await client.from("todos").select("id, html, done, done_at, position");
  if (error) return "missing";
  return sortTodos(data as Todo[]);
}

export function sortTodos(list: Todo[]) {
  return [...list].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.done) return (a.done_at ?? "").localeCompare(b.done_at ?? "");
    return a.position - b.position;
  });
}

// Only bold / italic / underline (and line breaks) survive; everything else is plain text.
export function cleanTodoHtml(raw: string) {
  const s = raw.slice(0, 4000);
  const out = s
    .replace(/<(\/?)(b|strong|i|em|u)(\s[^>]*)?>/gi, (_m, close: string, tag: string) => {
      const t = { strong: "b", em: "i" }[tag.toLowerCase()] ?? tag.toLowerCase();
      return `\u0000${close}${t}\u0001`;
    })
    .replace(/<br\s*\/?>/gi, "\u0000br\u0001")
    .replace(/<\/(div|p)>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\u0000/g, "<")
    .replace(/\u0001/g, ">")
    .replace(/(<br>)+$/g, "")
    .trim();
  return out;
}
