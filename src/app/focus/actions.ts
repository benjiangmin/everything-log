"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { focusHref } from "@/lib/home-pages";

// NOTE: the whole site sits behind the password lock (src/proxy.ts).

const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// A new, empty record (the home page's "Unrecreational record… (new)").
export async function createFocusRecord(): Promise<string> {
  const { data, error } = await db().from("focus_records").insert({}).select("id").single();
  if (error) throw new Error(`Couldn't make the record: ${error.message}`);
  return data.id;
}

async function recordOfArea(areaId: string): Promise<string | null> {
  const { data } = await db().from("focus_areas").select("record_id").eq("id", areaId).maybeSingle();
  return data?.record_id ?? null;
}

export type Result = { ok: true } | { ok: false; message: string };

export async function addFocusArea(recordId: string, name: string, goal: string): Promise<Result> {
  if (!isUuid(recordId)) return { ok: false, message: "Bad record." };
  const n = name.trim().slice(0, 100);
  if (!n) return { ok: false, message: "Name the focus area." };
  const top = await db().from("focus_areas").select("position").eq("record_id", recordId).order("position", { ascending: false }).limit(1).maybeSingle();
  const res = await db()
    .from("focus_areas")
    .insert({ record_id: recordId, name: n, goal: goal.trim().slice(0, 2000) || null, position: (top.data?.position ?? -1) + 1 });
  if (res.error) return { ok: false, message: `Couldn't save: ${res.error.message}` };
  revalidatePath(focusHref(recordId));
  return { ok: true };
}

export async function updateFocusArea(areaId: string, name: string, goal: string): Promise<Result> {
  if (!isUuid(areaId)) return { ok: false, message: "Bad focus area." };
  const n = name.trim().slice(0, 100);
  if (!n) return { ok: false, message: "Name the focus area." };
  const res = await db().from("focus_areas").update({ name: n, goal: goal.trim().slice(0, 2000) || null }).eq("id", areaId);
  if (res.error) return { ok: false, message: `Couldn't save: ${res.error.message}` };
  const record = await recordOfArea(areaId);
  if (record) revalidatePath(focusHref(record));
  return { ok: true };
}

export async function deleteFocusArea(areaId: string) {
  if (!isUuid(areaId)) return;
  const record = await recordOfArea(areaId);
  const { error } = await db().from("focus_areas").delete().eq("id", areaId);
  if (error) throw new Error(`Couldn't delete: ${error.message}`);
  if (record) revalidatePath(focusHref(record));
}

// Save a day's log (one per day per focus area: saving a day that already has one replaces it).
export async function saveFocusLog(areaId: string, date: string, log: string, notes: string): Promise<Result> {
  if (!isUuid(areaId)) return { ok: false, message: "Bad focus area." };
  if (!isDate(date)) return { ok: false, message: "Pick a date." };
  const l = log.trim().slice(0, 5000);
  if (!l) return { ok: false, message: "Write the log first." };
  const res = await db()
    .from("focus_logs")
    .upsert({ area_id: areaId, entry_date: date, log: l, notes: notes.trim().slice(0, 5000) || null }, { onConflict: "area_id,entry_date" });
  if (res.error) return { ok: false, message: `Couldn't save: ${res.error.message}` };
  const record = await recordOfArea(areaId);
  if (record) revalidatePath(focusHref(record));
  return { ok: true };
}

// Change a saved log (its date can move, as long as that day is free).
export async function updateFocusLog(logId: string, date: string, log: string, notes: string): Promise<Result> {
  if (!isUuid(logId)) return { ok: false, message: "Bad log." };
  if (!isDate(date)) return { ok: false, message: "Pick a date." };
  const l = log.trim().slice(0, 5000);
  if (!l) return { ok: false, message: "The log can't be empty." };
  const res = await db().from("focus_logs").update({ entry_date: date, log: l, notes: notes.trim().slice(0, 5000) || null }).eq("id", logId).select("area_id").single();
  if (res.error) {
    return { ok: false, message: res.error.code === "23505" ? "That day already has a log." : `Couldn't save: ${res.error.message}` };
  }
  const record = await recordOfArea(res.data.area_id);
  if (record) revalidatePath(focusHref(record));
  return { ok: true };
}

export async function deleteFocusLog(logId: string) {
  if (!isUuid(logId)) return;
  const res = await db().from("focus_logs").delete().eq("id", logId).select("area_id").maybeSingle();
  if (res.error) throw new Error(`Couldn't delete: ${res.error.message}`);
  const record = res.data ? await recordOfArea(res.data.area_id) : null;
  if (record) revalidatePath(focusHref(record));
}
