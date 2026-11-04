import "server-only";
import { db } from "./supabase";

export type HomeCategory = { id: string; name: string; item_count: number; section_id: string | null };
export type HomeItem = { id: string; name: string; blurb: string | null; href: string | null; section_id: string | null };
export type HomeSection = { id: string; name: string };

export const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

// Every category, in order, with how many subcategories each has (and which home section it's in).
export async function getCategories(): Promise<HomeCategory[]> {
  const query = (cols: string) => db().from("home_categories").select(cols).order("position").order("created_at");
  let res = await query("id, name, section_id, home_items(count)");
  // supabase/home-layout.sql not run yet: same as before, no sections.
  if (res.error) res = await query("id, name, home_items(count)");
  if (res.error) throw new Error(`Couldn't load categories: ${res.error.message}`);
  return (res.data as unknown as { id: string; name: string; section_id?: string | null; home_items: { count: number }[] }[]).map((c) => ({
    id: c.id,
    name: c.name,
    section_id: c.section_id ?? null,
    item_count: c.home_items[0]?.count ?? 0,
  }));
}

// The home screen's memo and its sections (empty until supabase/home-layout.sql is run).
export async function getHomeLayout(): Promise<{ description: string | null; sections: HomeSection[] }> {
  const [settings, sections] = await Promise.all([
    db().from("home_settings").select("description").eq("id", 1).maybeSingle(),
    db().from("home_category_sections").select("id, name").order("position").order("created_at"),
  ]);
  return { description: settings.data?.description ?? null, sections: sections.error ? [] : sections.data };
}

// One category: its description, its sections (subcategories) and its pages, in order.
// Also returns every category's name, for "Move to".
export async function getCategory(id: string): Promise<{
  category: { id: string; name: string; description: string | null };
  sections: HomeSection[];
  items: HomeItem[];
  all: { id: string; name: string }[];
} | null> {
  if (!isUuid(id)) return null;
  const [cats, sections, items] = await Promise.all([
    db().from("home_categories").select("id, name, description").order("position").order("created_at"),
    db().from("home_sections").select("id, name").eq("category_id", id).order("position").order("created_at"),
    db().from("home_items").select("id, name, blurb, href, section_id").eq("category_id", id).order("position").order("created_at"),
  ]);
  if (cats.error) throw new Error(`Couldn't load categories: ${cats.error.message}`);
  if (sections.error) throw new Error(`Couldn't load sections: ${sections.error.message}`);
  if (items.error) throw new Error(`Couldn't load pages: ${items.error.message}`);
  const category = cats.data.find((c) => c.id === id);
  if (!category) return null;
  return {
    category,
    sections: sections.data,
    items: items.data,
    all: cats.data.map((c) => ({ id: c.id, name: c.name })),
  };
}
