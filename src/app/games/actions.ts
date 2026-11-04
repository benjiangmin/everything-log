"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { safeCover, safeSourceId } from "@/lib/catalog";
import { duplicateMessage } from "@/lib/duplicates";

// NOTE: the whole site sits behind the password lock (src/proxy.ts).

export type FormState = { ok: boolean; message: string | null; savedAt?: number };

const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const STATUSES = ["playing", "completed", "stopped", "backlog"];

function read(formData: FormData) {
  const clean = (key: string, max: number) => String(formData.get(key) ?? "").trim().slice(0, max);
  const date = (key: string) => {
    const v = clean(key, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  };
  const title = clean("title", 120);
  const status = clean("status", 20);
  const started_on = date("started_on");
  const finished_on = date("finished_on");
  if (!title) return { error: "What's the game called?" } as const;
  if (!STATUSES.includes(status)) return { error: "Pick a status." } as const;
  if (started_on && finished_on && finished_on < started_on) return { error: "The end date is before the start." } as const;
  // Picked from IGDB: its cover + id come along (empty for your own titles).
  const cover = { cover_url: safeCover(formData.get("cover_url")), source_id: safeSourceId(formData.get("source_id")) };
  return { values: { title, status, started_on, finished_on, note: clean("note", 500) || null, ...cover } } as const;
}

export async function addGame(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = read(formData);
  if ("error" in parsed) return { ok: false, message: parsed.error ?? null };
  const dup = await duplicateMessage("games", parsed.values);
  if (dup) return { ok: false, message: dup };
  const top = await db().from("games").select("position").order("position", { ascending: false }).limit(1).maybeSingle();
  const res = await db().from("games").insert({ ...parsed.values, position: (top.data?.position ?? -1) + 1 });
  if (res.error) return { ok: false, message: `Couldn't save: ${res.error.message}` };
  revalidatePath("/games");
  return { ok: true, message: null, savedAt: Date.now() };
}

export async function updateGame(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Couldn't find that game." };
  const parsed = read(formData);
  if ("error" in parsed) return { ok: false, message: parsed.error ?? null };
  const dup = await duplicateMessage("games", parsed.values, id);
  if (dup) return { ok: false, message: dup };
  const res = await db().from("games").update(parsed.values).eq("id", id);
  if (res.error) return { ok: false, message: `Couldn't save: ${res.error.message}` };
  revalidatePath("/games");
  return { ok: true, message: null, savedAt: Date.now() };
}

export async function deleteGame(id: string) {
  if (!isUuid(id)) return;
  const { error } = await db().from("games").delete().eq("id", id);
  if (error) throw new Error(`Couldn't delete: ${error.message}`);
  revalidatePath("/games");
}

// Dragged to another column. If it has no date yet: moving to Playing sets the start to `today`,
// moving to Completed sets the finish to `today` (your computer's date, sent by the board).
export async function moveGame(id: string, status: string, today: string) {
  if (!isUuid(id) || !STATUSES.includes(status)) throw new Error("Bad move.");
  const { data, error } = await db().from("games").select("started_on, finished_on").eq("id", id).maybeSingle();
  if (error || !data) throw new Error(`Couldn't move it: ${error?.message ?? "not found"}`);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : null;
  const changes: { status: string; started_on?: string; finished_on?: string } = { status };
  if (day && status === "playing" && !data.started_on) changes.started_on = day;
  if (day && status === "completed" && !data.finished_on) changes.finished_on = day;
  // Backlog moves to the end of the queue.
  if (status === "backlog") {
    const top = await db().from("games").select("position").order("position", { ascending: false }).limit(1).maybeSingle();
    Object.assign(changes, { position: (top.data?.position ?? -1) + 1 });
  }
  const res = await db().from("games").update(changes).eq("id", id);
  if (res.error) throw new Error(`Couldn't move it: ${res.error.message}`);
  revalidatePath("/games");
}
