"use server";

import { db } from "@/lib/supabase";

export type AppHit = { id: string; name: string; blurb: string | null; href: string; category: string };

// Every app (a home page card that opens a page), in home page order, for the sidebar's search.
export async function allApps(): Promise<{ apps: AppHit[] } | { error: string }> {
  const [cats, items] = await Promise.all([
    db().from("home_categories").select("id, name").order("position").order("created_at"),
    db().from("home_items").select("id, name, blurb, href, category_id").not("href", "is", null).order("position").order("created_at"),
  ]);
  if (cats.error) return { error: `Couldn't load apps: ${cats.error.message}` };
  if (items.error) return { error: `Couldn't load apps: ${items.error.message}` };
  const order = new Map(cats.data.map((c, i) => [c.id as string, i]));
  const names = new Map(cats.data.map((c) => [c.id as string, c.name as string]));
  const apps = items.data
    .map((i) => ({ id: i.id as string, name: i.name as string, blurb: i.blurb as string | null, href: i.href as string, category: names.get(i.category_id) ?? "", rank: order.get(i.category_id) ?? 999 }))
    .sort((a, b) => a.rank - b.rank)
    .map((a) => ({ id: a.id, name: a.name, blurb: a.blurb, href: a.href, category: a.category }));
  return { apps };
}
