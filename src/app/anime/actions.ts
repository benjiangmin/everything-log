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
  const title = clean("title", 150);
  const status = clean("status", 20);
  if (!title) return { error: "What's it called?" } as const;
  if (!STATUSES.includes(status)) return { error: "Pick a status." } as const;
  // Picked from AniList: its cover + id come along (empty for your own titles).
  const cover = { cover_url: safeCover(formData.get("cover_url")), source_id: safeSourceId(formData.get("source_id")) };
  return { values: { title, status, is_movie: formData.get("is_movie") === "on", note: clean("note", 500) || null, ...cover } } as const;
}

async function nextPosition() {
  const top = await db().from("anime").select("position").order("position", { ascending: false }).limit(1).maybeSingle();
  return (top.data?.position ?? -1) + 1;
}

export async function addAnime(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = read(formData);
  if ("error" in parsed) return { ok: false, message: parsed.error ?? null };
  const dup = await duplicateMessage("anime", parsed.values);
  if (dup) return { ok: false, message: dup };
  const res = await db().from("anime").insert({ ...parsed.values, position: await nextPosition() });
  if (res.error) return { ok: false, message: `Couldn't save: ${res.error.message}` };
  revalidatePath("/anime");
  return { ok: true, message: null, savedAt: Date.now() };
}

export async function updateAnime(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Couldn't find that one." };
  const parsed = read(formData);
  if ("error" in parsed) return { ok: false, message: parsed.error ?? null };
  const dup = await duplicateMessage("anime", parsed.values, id);
  if (dup) return { ok: false, message: dup };
  const res = await db().from("anime").update(parsed.values).eq("id", id);
  if (res.error) return { ok: false, message: `Couldn't save: ${res.error.message}` };
  revalidatePath("/anime");
  return { ok: true, message: null, savedAt: Date.now() };
}

export async function deleteAnime(id: string) {
  if (!isUuid(id)) return;
  const { error } = await db().from("anime").delete().eq("id", id);
  if (error) throw new Error(`Couldn't delete: ${error.message}`);
  revalidatePath("/anime");
}

// Dragged to another area. Moving to Plan to watch puts it at the end of that queue.
export async function moveAnime(id: string, status: string) {
  if (!isUuid(id) || !STATUSES.includes(status)) throw new Error("Bad move.");
  const changes: { status: string; position?: number } = { status };
  if (status === "backlog") changes.position = await nextPosition();
  const res = await db().from("anime").update(changes).eq("id", id);
  if (res.error) throw new Error(`Couldn't move it: ${res.error.message}`);
  revalidatePath("/anime");
}
