"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { sameText } from "@/lib/auth";
import { cleanDreamHtml, htmlToText } from "@/lib/dream-html";
import { countArrived, getArrived, getQueued, todayKey, type Envelope, type Letter } from "@/lib/letters";

// NOTE: the whole site sits behind the password lock (src/proxy.ts). Letters still on the way
// need the password again to read (unlockQueued); they're never sent to the page otherwise.

export type FormState = { ok: boolean; message: string | null; savedAt?: number; deliverOn?: string };

const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

// The written date isn't up to the form: a new letter is written today, an edit keeps its date.
function read(formData: FormData) {
  const subject = String(formData.get("subject") ?? "").trim().slice(0, 200);
  const body = cleanDreamHtml(String(formData.get("body") ?? ""));
  const deliver = String(formData.get("deliver_on") ?? "");
  if (!subject) return { error: "Give it a subject." } as const;
  if (!htmlToText(body)) return { error: "Write the letter first." } as const;
  if (!isDate(deliver)) return { error: "Pick when it should arrive." } as const;
  return { values: { subject, body, deliver_on: deliver } } as const;
}

export async function addLetter(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = read(formData);
  if ("error" in parsed) return { ok: false, message: parsed.error ?? null };
  const res = await db().from("letters").insert({ ...parsed.values, written_on: todayKey() });
  if (res.error) return { ok: false, message: `Couldn't send: ${res.error.message}` };
  revalidatePath("/letters");
  return { ok: true, message: null, savedAt: Date.now(), deliverOn: parsed.values.deliver_on };
}

export async function updateLetter(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Couldn't find that letter." };
  const parsed = read(formData);
  if ("error" in parsed) return { ok: false, message: parsed.error ?? null };
  const res = await db().from("letters").update(parsed.values).eq("id", id);
  if (res.error) return { ok: false, message: `Couldn't save: ${res.error.message}` };
  revalidatePath("/letters");
  return { ok: true, message: null, savedAt: Date.now(), deliverOn: parsed.values.deliver_on };
}

export async function deleteLetter(id: string) {
  if (!isUuid(id)) return;
  const { error } = await db().from("letters").delete().eq("id", id);
  if (error) throw new Error(`Couldn't delete: ${error.message}`);
  revalidatePath("/letters");
}

// The inbox (sidebar): arrived letters you haven't read, sealed.
export async function inboxLetters(): Promise<{ ok: true; letters: Envelope[] } | { ok: false; message: string }> {
  try {
    return { ok: true, letters: await getArrived() };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

// For the inbox button's red "!".
export async function inboxCount(): Promise<number> {
  try {
    return await countArrived();
  } catch {
    return 0;
  }
}

// Open an arrived letter to read it (it stays in the inbox until you mark it read).
export async function openLetter(id: string): Promise<{ ok: true; letter: Letter } | { ok: false; message: string }> {
  if (!isUuid(id)) return { ok: false, message: "Couldn't find that letter." };
  const { data, error } = await db()
    .from("letters")
    .select("id, subject, body, written_on, deliver_on, opened_at")
    .eq("id", id)
    .lte("deliver_on", todayKey()) // can't open one that hasn't arrived
    .maybeSingle();
  if (error || !data) return { ok: false, message: "Couldn't open that letter." };
  return { ok: true, letter: { ...(data as Letter), body: cleanDreamHtml(data.body) } };
}

// Mark as read: it moves from the inbox to Past letters.
export async function markRead(id: string): Promise<{ ok: boolean; message?: string }> {
  if (!isUuid(id)) return { ok: false, message: "Couldn't find that letter." };
  const { error } = await db().from("letters").update({ opened_at: new Date().toISOString() }).eq("id", id).lte("deliver_on", todayKey());
  if (error) return { ok: false, message: `Couldn't mark it read: ${error.message}` };
  revalidatePath("/letters");
  return { ok: true };
}

// The letters on the way, if the password is right (the same one as the login page).
export async function unlockQueued(given: string): Promise<{ ok: true; letters: Letter[] } | { ok: false; message: string }> {
  const password = process.env.SITE_PASSWORD;
  if (password && !sameText(given, password)) {
    await new Promise((r) => setTimeout(r, 1000)); // slows down guessing
    return { ok: false, message: "Wrong password." };
  }
  try {
    return { ok: true, letters: await getQueued() };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
