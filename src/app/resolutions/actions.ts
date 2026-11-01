"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";

// NOTE: the whole site sits behind the password lock (src/proxy.ts).

export type FormState = { ok: boolean; message: string | null; savedAt?: number };

const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const isYear = (y: number) => Number.isInteger(y) && y >= 1900 && y <= 2100;
const done = () => revalidatePath("/resolutions");

export async function addResolution(_prev: FormState, formData: FormData): Promise<FormState> {
  const year = Number(formData.get("year"));
  const title = String(formData.get("title") ?? "").trim().slice(0, 300);
  if (!isYear(year)) return { ok: false, message: "Bad year." };
  if (!title) return { ok: false, message: "What's the resolution?" };
  const top = await db().from("resolutions").select("position").eq("year", year).order("position", { ascending: false }).limit(1).maybeSingle();
  const res = await db().from("resolutions").insert({ year, title, position: (top.data?.position ?? -1) + 1 });
  if (res.error) return { ok: false, message: `Couldn't save: ${res.error.message}` };
  done();
  return { ok: true, message: null, savedAt: Date.now() };
}

// Rename a resolution and/or write its reflection. Empty reflection = not written yet.
export async function updateResolution(id: string, title: string, reflection: string) {
  if (!isUuid(id)) throw new Error("Bad id.");
  const t = title.trim().slice(0, 300);
  if (!t) throw new Error("What's the resolution?");
  const r = reflection.trim().slice(0, 5000);
  const { error } = await db().from("resolutions").update({ title: t, reflection: r || null }).eq("id", id);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  done();
}

export async function deleteResolution(id: string) {
  if (!isUuid(id)) return;
  const { error } = await db().from("resolutions").delete().eq("id", id);
  if (error) throw new Error(`Couldn't delete: ${error.message}`);
  done();
}

// The note above a year's list (empty = no note).
export async function saveYearNote(year: number, note: string) {
  if (!isYear(year)) throw new Error("Bad year.");
  const n = note.trim().slice(0, 5000);
  const { error } = await db().from("resolution_years").upsert({ year, note: n || null }, { onConflict: "year" });
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  done();
}

// Start a year with last year's resolutions (titles only; reflections start blank).
export async function copyLastYear(year: number) {
  if (!isYear(year)) throw new Error("Bad year.");
  const already = await db().from("resolutions").select("id", { count: "exact", head: true }).eq("year", year);
  if ((already.count ?? 0) > 0) return; // only into an empty year
  const last = await db().from("resolutions").select("title, position").eq("year", year - 1).order("position");
  if (last.error) throw new Error(`Couldn't copy: ${last.error.message}`);
  if (last.data.length === 0) return;
  const res = await db().from("resolutions").insert(last.data.map((r, i) => ({ year, title: r.title, position: i })));
  if (res.error) throw new Error(`Couldn't copy: ${res.error.message}`);
  done();
}
