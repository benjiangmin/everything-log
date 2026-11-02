"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { getSubscriptions, type Subscription } from "@/lib/subscriptions";

// NOTE: the whole site sits behind the password lock (src/proxy.ts).

export type FormState = { ok: boolean; message: string | null; savedAt?: number };

const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

function read(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const price = Number(formData.get("price"));
  const cycle = formData.get("cycle") === "yearly" ? "yearly" : "monthly";
  const next = String(formData.get("next_charge") ?? "");
  if (!name) return { error: "Give it a name." } as const;
  if (!Number.isFinite(price) || price < 0) return { error: "Enter a price." } as const;

  // The link box only exists while it's open: no box = leave the saved link as it is.
  let link: { link: string | null } | Record<string, never> = {};
  if (formData.has("link")) {
    const raw = String(formData.get("link") ?? "").trim().slice(0, 500);
    if (!raw) link = { link: null };
    else {
      const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      try {
        link = { link: new URL(withScheme).toString() };
      } catch {
        return { error: "That link doesn't look right." } as const;
      }
    }
  }

  return {
    values: {
      name,
      price: Math.round(price * 100) / 100,
      cycle,
      next_charge: /^\d{4}-\d{2}-\d{2}$/.test(next) ? next : null,
      ...link,
    },
  } as const;
}

function changed() {
  revalidatePath("/subscriptions");
  revalidatePath("/budget");
}

export async function addSubscription(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = read(formData);
  if ("error" in parsed) return { ok: false, message: parsed.error ?? null };
  const res = await db().from("subscriptions").insert(parsed.values);
  if (res.error) return { ok: false, message: `Couldn't save: ${res.error.message}` };
  changed();
  return { ok: true, message: null, savedAt: Date.now() };
}

export async function updateSubscription(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Couldn't find that subscription." };
  const parsed = read(formData);
  if ("error" in parsed) return { ok: false, message: parsed.error ?? null };
  const res = await db().from("subscriptions").update(parsed.values).eq("id", id);
  if (res.error) return { ok: false, message: `Couldn't save: ${res.error.message}` };
  changed();
  return { ok: true, message: null, savedAt: Date.now() };
}

// Cancelled ↔ active.
export async function setCancelled(id: string, cancelled: boolean) {
  if (!isUuid(id)) return;
  const { error } = await db()
    .from("subscriptions")
    .update({ cancelled_at: cancelled ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(`Couldn't update: ${error.message}`);
  changed();
}

export async function deleteSubscription(id: string) {
  if (!isUuid(id)) return;
  const { error } = await db().from("subscriptions").delete().eq("id", id);
  if (error) throw new Error(`Couldn't delete: ${error.message}`);
  changed();
}

// For the budget's sidebar: the monthly ones still running.
export async function monthlySubscriptions(): Promise<{ subs: Subscription[] } | { error: string }> {
  try {
    const all = await getSubscriptions();
    return { subs: all.filter((s) => !s.cancelled && s.cycle === "monthly") };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
