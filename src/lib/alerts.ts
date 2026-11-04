import "server-only";
import { db } from "./supabase";
import { localNow } from "./month";
import { countPendingInbox } from "./budget-inbox";
import { countArrived } from "./letters";
import { bibleHref, bibleYear } from "./home-pages";

// The red "!" on home / category cards: pages that want your attention.
//  - Budget: purchases from your alert emails waiting for review
//  - Letters to self: a letter has arrived and you haven't opened it
//  - After 5pm, if today has nothing yet: Gratitude, Something new I've learned, and the newest
//    Bible in a year (this year's)
// Anything that fails to load just doesn't get a "!" (never breaks the page).

export const EVENING_HOUR = 17;

const pad = (n: number) => String(n).padStart(2, "0");

async function hasRowFor(table: string, date: string): Promise<boolean> {
  const { count, error } = await db().from(table).select("id", { count: "exact", head: true }).eq("entry_date", date);
  if (error) throw error;
  return (count ?? 0) > 0;
}

const safe = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);

// The page addresses (hrefs) that need a "!".
export async function getAlertHrefs(): Promise<string[]> {
  const now = localNow();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const evening = now.getHours() >= EVENING_HOUR;

  const checks: Promise<string | null>[] = [
    safe(countPendingInbox().then((n) => (n > 0 ? "/budget" : null)), null),
    safe(countArrived().then((n) => (n > 0 ? "/letters" : null)), null),
  ];

  if (evening) {
    checks.push(
      safe(hasRowFor("gratitude_entries", today).then((done) => (done ? null : "/gratitude")), null),
      safe(hasRowFor("learned_entries", today).then((done) => (done ? null : "/learned")), null),
      // The newest Bible in a year on the home page, if it's this year's.
      safe(
        (async () => {
          const { data, error } = await db().from("home_items").select("href").like("href", "/bible/%");
          if (error) throw error;
          const years = data.map((d) => bibleYear(d.href)).filter((y): y is number => y !== null);
          const newest = years.length ? Math.max(...years) : null;
          if (newest !== now.getFullYear()) return null;
          return (await hasRowFor("bible_entries", today)) ? null : bibleHref(newest);
        })(),
        null,
      ),
    );
  }

  return (await Promise.all(checks)).filter((h): h is string => h !== null);
}

// The categories holding any of those pages (for the home page's cards).
export async function getAlertCategoryIds(hrefs: string[]): Promise<string[]> {
  if (!hrefs.length) return [];
  const { data, error } = await db().from("home_items").select("category_id").in("href", hrefs);
  if (error) return [];
  return [...new Set(data.map((d) => d.category_id as string))];
}
