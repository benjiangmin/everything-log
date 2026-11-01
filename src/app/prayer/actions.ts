"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { cleanDreamHtml, htmlToText } from "@/lib/dream-html";

// NOTE: the whole site sits behind the password lock (src/proxy.ts).

export type FormState = { ok: boolean; message: string | null; savedAt?: number };

const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

function read(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  const date = String(formData.get("prayed_on") ?? "");
  const body = cleanDreamHtml(String(formData.get("body") ?? ""));
  if (!htmlToText(body)) return { error: "Write the prayer first." } as const;
  return { values: { title: title || null, prayed_on: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null, body } } as const;
}

export async function addPrayer(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = read(formData);
  if ("error" in parsed) return { ok: false, message: parsed.error ?? null };
  const top = await db().from("prayers").select("position").order("position", { ascending: false }).limit(1).maybeSingle();
  const res = await db().from("prayers").insert({ ...parsed.values, position: (top.data?.position ?? -1) + 1 });
  if (res.error) return { ok: false, message: `Couldn't save: ${res.error.message}` };
  revalidatePath("/prayer");
  return { ok: true, message: null, savedAt: Date.now() };
}

export async function updatePrayer(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Couldn't find that prayer." };
  const parsed = read(formData);
  if ("error" in parsed) return { ok: false, message: parsed.error ?? null };
  const res = await db().from("prayers").update(parsed.values).eq("id", id);
  if (res.error) return { ok: false, message: `Couldn't save: ${res.error.message}` };
  revalidatePath("/prayer");
  return { ok: true, message: null, savedAt: Date.now() };
}

export async function deletePrayer(id: string) {
  if (!isUuid(id)) return;
  const { error } = await db().from("prayers").delete().eq("id", id);
  if (error) throw new Error(`Couldn't delete: ${error.message}`);
  revalidatePath("/prayer");
}
