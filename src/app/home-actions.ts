"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { isUuid } from "@/lib/home";
import { isKnownPage } from "@/lib/home-pages";

// Everything that changes the home page layout. NOTE: no login yet, same as the other pages.

const cleanName = (s: string) => {
  const name = s.trim().slice(0, 60);
  if (!name) throw new Error("Name can't be empty.");
  return name;
};
const checkId = (id: string) => {
  if (!isUuid(id)) throw new Error("Bad id.");
  return id;
};
function done() {
  revalidatePath("/"); // home page
  revalidatePath("/c/[id]", "page"); // every category page
}
async function run(label: string, query: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await query;
  if (error) throw new Error(`Couldn't ${label}: ${error.message}`);
}
// Next position at the end of a list.
async function endOf(table: "home_categories" | "home_items", categoryId?: string) {
  let q = db().from(table).select("id", { count: "exact", head: true });
  if (categoryId) q = q.eq("category_id", categoryId);
  const { count } = await q;
  return count ?? 0;
}
// Save a new order: each id gets its index as its position.
async function saveOrder(table: "home_categories" | "home_items", ids: string[]) {
  const results = await Promise.all(
    ids.map((id, i) => db().from(table).update({ position: i }).eq("id", checkId(id))),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(`Couldn't save the order: ${failed.error.message}`);
}

/* Categories */

// sectionId: which home section it goes in (null = no section).
export async function addCategory(name: string, sectionId: string | null = null) {
  await run(
    "add the category",
    db()
      .from("home_categories")
      .insert({
        name: cleanName(name),
        position: await endOf("home_categories"),
        ...(sectionId ? { section_id: checkId(sectionId) } : {}),
      }),
  );
  done();
}

/* The home screen itself: its memo and its sections */

// The short line under "Home". Empty = none.
export async function setHomeDescription(description: string) {
  const d = description.trim().slice(0, 200) || null;
  await run("save the description", db().from("home_settings").upsert({ id: 1, description: d }));
  done();
}

export async function addHomeSection(name: string) {
  const { count } = await db().from("home_category_sections").select("id", { count: "exact", head: true });
  await run("add the section", db().from("home_category_sections").insert({ name: cleanName(name), position: count ?? 0 }));
  done();
}

export async function renameHomeSection(id: string, name: string) {
  await run("rename", db().from("home_category_sections").update({ name: cleanName(name) }).eq("id", checkId(id)));
  done();
}

// Its categories stay, back in "no section".
export async function deleteHomeSection(id: string) {
  await run("delete", db().from("home_category_sections").delete().eq("id", checkId(id)));
  done();
}

// Save the home screen's whole layout after a drag: the sections' order, and every category's
// section and order.
export async function saveHomeLayout(sectionIds: string[], categories: { id: string; section_id: string | null }[]) {
  const results = await Promise.all([
    ...sectionIds.map((id, i) => db().from("home_category_sections").update({ position: i }).eq("id", checkId(id))),
    ...categories.map((c, i) =>
      db()
        .from("home_categories")
        .update({ position: i, section_id: c.section_id === null ? null : checkId(c.section_id) })
        .eq("id", checkId(c.id)),
    ),
  ]);
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(`Couldn't save the order: ${failed.error.message}`);
  done();
}

// The short line under a category's title. Empty = none.
export async function setCategoryDescription(id: string, description: string) {
  const d = description.trim().slice(0, 200) || null;
  await run("save the description", db().from("home_categories").update({ description: d }).eq("id", checkId(id)));
  done();
}

export async function renameCategory(id: string, name: string) {
  await run("rename", db().from("home_categories").update({ name: cleanName(name) }).eq("id", checkId(id)));
  done();
}

// Also deletes the subcategories inside it (not the pages themselves, like your budget data).
export async function deleteCategory(id: string) {
  await run("delete", db().from("home_categories").delete().eq("id", checkId(id)));
  done();
}

export async function reorderCategories(ids: string[]) {
  await saveOrder("home_categories", ids);
  done();
}

/* Subcategories */

// sectionId: which section it goes in (null = no section).
export async function addItem(categoryId: string, name: string, sectionId: string | null = null) {
  await run(
    "add the page",
    db().from("home_items").insert({
      category_id: checkId(categoryId),
      section_id: sectionId === null ? null : checkId(sectionId),
      name: cleanName(name),
      position: await endOf("home_items", categoryId),
    }),
  );
  done();
}

export async function updateItem(id: string, changes: { name?: string; blurb?: string; href?: string | null }) {
  const row: { name?: string; blurb?: string | null; href?: string | null } = {};
  if (changes.name !== undefined) row.name = cleanName(changes.name);
  if (changes.blurb !== undefined) row.blurb = changes.blurb.trim().slice(0, 120) || null;
  if (changes.href !== undefined) {
    if (changes.href !== null && !isKnownPage(changes.href)) throw new Error("Unknown page.");
    row.href = changes.href;
  }
  await run("save", db().from("home_items").update(row).eq("id", checkId(id)));
  done();
}

export async function deleteItem(id: string) {
  await run("delete", db().from("home_items").delete().eq("id", checkId(id)));
  done();
}

export async function reorderItems(ids: string[]) {
  await saveOrder("home_items", ids);
  done();
}

// Moves a subcategory to the end of another category.
export async function moveItem(id: string, categoryId: string) {
  const position = await endOf("home_items", checkId(categoryId));
  await run("move", db().from("home_items").update({ category_id: categoryId, section_id: null, position }).eq("id", checkId(id)));
  done();
}

/* Sections (subcategories inside a category) */

export async function addSection(categoryId: string, name: string) {
  const { count } = await db().from("home_sections").select("id", { count: "exact", head: true }).eq("category_id", checkId(categoryId));
  await run("add the subcategory", db().from("home_sections").insert({ category_id: categoryId, name: cleanName(name), position: count ?? 0 }));
  done();
}

export async function renameSection(id: string, name: string) {
  await run("rename", db().from("home_sections").update({ name: cleanName(name) }).eq("id", checkId(id)));
  done();
}

// Its pages stay, back in "no section".
export async function deleteSection(id: string) {
  await run("delete", db().from("home_sections").delete().eq("id", checkId(id)));
  done();
}

// Save a category's whole layout after a drag: the sections' order, and every page's section and order.
export async function saveCategoryLayout(sectionIds: string[], items: { id: string; section_id: string | null }[]) {
  const results = await Promise.all([
    ...sectionIds.map((id, i) => db().from("home_sections").update({ position: i }).eq("id", checkId(id))),
    ...items.map((it, i) =>
      db()
        .from("home_items")
        .update({ position: i, section_id: it.section_id === null ? null : checkId(it.section_id) })
        .eq("id", checkId(it.id)),
    ),
  ]);
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(`Couldn't save the order: ${failed.error.message}`);
  done();
}
