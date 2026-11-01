"use server";

import { db } from "@/lib/supabase";

// Where "← Back" goes from a page: the category page that links to it (e.g. /gratitude → its
// category). Months, ?focus=… and the like don't matter. No category links to it → Home.
export async function parentOf(path: string): Promise<string> {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (clean === "/") return "/";
  const { data } = await db()
    .from("home_items")
    .select("category_id")
    .eq("href", clean)
    .limit(1);
  const id = data?.[0]?.category_id;
  return id ? `/c/${id}` : "/";
}
