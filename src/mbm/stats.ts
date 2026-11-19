import "server-only";
import { mbm } from "./supabase";
import { dayKeyOf, shiftDay, zonedTime } from "./time";

// The Stats pages: a day, a week (Sunday to Saturday), a month or a year, and what happened in it
// (supabase/minute-by-minute/020_stats.sql does the adding up).

export type Range = "day" | "week" | "month" | "year";
export const RANGES: Range[] = ["day", "week", "month", "year"];
export const isRange = (s: unknown): s is Range => RANGES.includes(s as Range);

export type Stats = {
  from: string; // when it starts
  to: string; // up to when it counts (now, if it's still going)
  activities: { name: string; color: string; seconds: number }[];
  tracked_seconds: number;
  gaps: { start: string; end: string }[];
  apps: { app: string; seconds: number }[];
  distance_m: number;
};

export type Period = {
  range: Range;
  first: string; // first day, "YYYY-MM-DD"
  next: string; // first day after it
  title: string;
  prev: string; // a day in the period before
  after: string | null; // a day in the period after (null: that's the future)
};

const utc = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const fmt = (key: string, opts: Intl.DateTimeFormatOptions) => utc(key).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

export function periodOf(range: Range, dayKey: string, today: string): Period {
  let first: string;
  let next: string;
  let title: string;
  const [y, m] = dayKey.split("-").map(Number);
  if (range === "day") {
    first = dayKey;
    next = shiftDay(dayKey, 1);
    title = fmt(first, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  } else if (range === "week") {
    first = shiftDay(dayKey, -utc(dayKey).getUTCDay()); // back to Sunday
    next = shiftDay(first, 7);
    const last = shiftDay(first, 6);
    const sameMonth = first.slice(0, 7) === last.slice(0, 7);
    title = `${fmt(first, { month: "short", day: "numeric" })} – ${fmt(last, sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" })}, ${last.slice(0, 4)}`;
  } else if (range === "month") {
    first = `${dayKey.slice(0, 7)}-01`;
    next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    title = fmt(first, { month: "long", year: "numeric" });
  } else {
    first = `${y}-01-01`;
    next = `${y + 1}-01-01`;
    title = String(y);
  }
  const prev = range === "day" ? shiftDay(first, -1) : range === "week" ? shiftDay(first, -7) : range === "month" ? shiftDay(first, -1) : `${y - 1}-01-01`;
  return { range, first, next, title, prev, after: next <= today ? next : null };
}

export async function getStats(period: Period, tz: string): Promise<Stats> {
  const client = await mbm();
  const { data, error } = await client.rpc("period_stats", {
    p_from: zonedTime(period.first, 0, tz).toISOString(),
    p_to: zonedTime(period.next, 0, tz).toISOString(),
  });
  if (error) {
    throw new Error(/period_stats/.test(error.message) ? "Run supabase/minute-by-minute/020_stats.sql in the minute-by-minute project." : error.message);
  }
  return data as Stats;
}

// Your jobs' categories, goals and hiding (043). Empty before it's run.
export type JobMeta = {
  jobs: Record<string, { category: string | null; hidden: boolean; goal: number | null }>; // by lower-cased name
  categories: Record<string, { name: string; color: string; goal: number | null }>; // by id
};
export async function getJobMeta(): Promise<JobMeta> {
  const client = await mbm();
  const [a, c] = await Promise.all([
    client.from("activities").select("name, category_id, hide_from_stats, weekly_goal_min"),
    client.from("categories").select("id, name, color, hide_from_stats, weekly_goal_min"),
  ]);
  if (a.error || c.error) return { jobs: {}, categories: {} };
  const cats = (c.data ?? []) as { id: string; name: string; color: string; hide_from_stats: boolean | null; weekly_goal_min: number | null }[];
  const byId = new Map(cats.map((x) => [x.id, x]));
  const jobs: JobMeta["jobs"] = {};
  for (const j of (a.data ?? []) as { name: string; category_id: string | null; hide_from_stats: boolean | null; weekly_goal_min: number | null }[]) {
    const cat = j.category_id ? byId.get(j.category_id) : undefined;
    jobs[j.name.trim().toLowerCase()] = { category: cat?.id ?? null, hidden: j.hide_from_stats ?? cat?.hide_from_stats ?? false, goal: j.weekly_goal_min };
  }
  return { jobs, categories: Object.fromEntries(cats.map((x) => [x.id, { name: x.name, color: x.color, goal: x.weekly_goal_min }])) };
}

export const todayKey = (tz: string) => dayKeyOf(new Date(), tz);

// Your pinned activities on "Time spent", oldest first (023_pins.sql; none if it isn't run yet).
export async function getPins(): Promise<string[] | null> {
  const client = await mbm();
  const { data, error } = await client.from("stat_pins").select("name").order("created_at");
  if (error) return null; // null: can't pin yet
  return (data as { name: string }[]).map((p) => p.name);
}
