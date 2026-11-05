import "server-only";
import { mbm } from "./supabase";
import { DEFAULT_TZ, dayRange } from "./time";

export type Activity = { id: string; name: string; color: string; last_used_at: string };
export type Block = {
  id: string;
  started_at: string;
  ended_at: string | null; // null = now
  activity_id: string | null;
  note: string | null;
  source: "manual" | "calendar" | "location" | "health" | "app";
  confirmed: boolean;
};
export type Day = {
  dayKey: string;
  tz: string;
  start: string;
  end: string;
  blocks: Block[];
  activities: Activity[];
  now: Block | null;
  loadedAt: number; // when the server read it (the live clock starts from here)
};

export const mbmTz = () => process.env.MBM_TIMEZONE || DEFAULT_TZ;

// One day (midnight to midnight): every block touching it, your activities (most recently used
// first, for the quick picks), and what you're doing right now.
export async function getDay(dayKey: string): Promise<Day> {
  const tz = mbmTz();
  const { start, end } = dayRange(dayKey, tz);
  const client = await mbm();
  const [blocks, activities, now] = await Promise.all([
    client
      .from("blocks")
      .select("id, started_at, ended_at, activity_id, note, source, confirmed")
      .lt("started_at", end.toISOString())
      .or(`ended_at.is.null,ended_at.gt.${start.toISOString()}`)
      .order("started_at"),
    client.from("activities").select("id, name, color, last_used_at").order("last_used_at", { ascending: false }),
    client.from("blocks").select("id, started_at, ended_at, activity_id, note, source, confirmed").is("ended_at", null).maybeSingle(),
  ]);
  const error = blocks.error ?? activities.error ?? now.error;
  if (error) {
    throw new Error(
      /relation .* does not exist|schema cache/i.test(error.message)
        ? "Minute by Minute's tables aren't set up yet: run supabase/minute-by-minute/001_core.sql in the minute-by-minute project."
        : `Couldn't load the day: ${error.message}`,
    );
  }
  return {
    dayKey,
    tz,
    start: start.toISOString(),
    end: end.toISOString(),
    blocks: blocks.data as Block[],
    activities: activities.data as Activity[],
    now: (now.data as Block | null) ?? null,
    loadedAt: Date.now(),
  };
}
