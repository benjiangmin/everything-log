"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { getCategories, type Category } from "@/lib/budget";
import { countPendingInbox, getPendingInbox, type InboxItem } from "@/lib/budget-inbox";

// The budget's review list (the inbox button in the sidebar): purchases read from alert emails.

const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export async function inboxCount(): Promise<number> {
  try {
    return await countPendingInbox();
  } catch {
    return 0; // table not set up yet, or Supabase unreachable: just show no badge
  }
}

export async function getInbox(): Promise<{ items: InboxItem[]; categories: Category[] } | { error: string }> {
  try {
    const [items, categories] = await Promise.all([getPendingInbox(), getCategories()]);
    return { items, categories };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export type InboxResult = { ok: true } | { ok: false; message: string };

// Add one to the budget as an expense (with whatever you changed in the review list).
export async function addFromInbox(id: string, formData: FormData): Promise<InboxResult> {
  if (!isUuid(id)) return { ok: false, message: "Couldn't find that one." };
  const amount = Number(formData.get("amount"));
  const categoryId = Number(formData.get("category_id"));
  const spentOn = String(formData.get("spent_on") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 120);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: "Enter an amount greater than 0." };
  if (!Number.isInteger(categoryId) || categoryId <= 0) return { ok: false, message: "Pick a category." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(spentOn)) return { ok: false, message: "Pick a date." };

  const { data: entry, error } = await db()
    .from("entries")
    .insert({ amount: Math.round(amount * 100) / 100, category_id: categoryId, spent_on: spentOn, note: note || null })
    .select("id")
    .single();
  if (error) return { ok: false, message: `Couldn't save: ${error.message}` };

  const res = await db().from("budget_inbox").update({ status: "added", entry_id: entry.id }).eq("id", id);
  if (res.error) return { ok: false, message: `Saved, but couldn't clear it from the list: ${res.error.message}` };

  revalidatePath("/budget");
  return { ok: true };
}

export async function dismissFromInbox(id: string): Promise<InboxResult> {
  if (!isUuid(id)) return { ok: false, message: "Couldn't find that one." };
  const { error } = await db().from("budget_inbox").update({ status: "dismissed" }).eq("id", id);
  if (error) return { ok: false, message: `Couldn't dismiss: ${error.message}` };
  return { ok: true };
}
