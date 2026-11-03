import "server-only";
import { db } from "./supabase";

// Calisthenics: plans (Plan #1, #2…; the newest is the current one, older ones are kept to look
// back at) → blocks for each day (or "daily") → exercises.

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number] | "daily";

export type Exercise = { id: string; name: string; sets: string | null; load: string | null; position: number };
export type Block = {
  id: string;
  day: Day;
  title: string;
  duration: string | null;
  note: string | null;
  position: number;
  exercises: Exercise[];
};
export type PlanSummary = { id: string; number: number; name: string | null; created_at: string };
export type Plan = PlanSummary & { blocks: Block[]; current: boolean };

export async function getPlans(): Promise<PlanSummary[]> {
  const { data, error } = await db().from("calisthenics_plans").select("id, number, name, created_at").order("number", { ascending: false });
  if (error) throw new Error(`Couldn't load plans: ${error.message}`);
  return data;
}

// One plan with everything in it (blocks and exercises in order).
export async function getPlan(plan: PlanSummary, current: boolean): Promise<Plan> {
  const { data: blocks, error } = await db()
    .from("calisthenics_blocks")
    .select("id, day, title, duration, note, position, calisthenics_exercises(id, name, sets, load, position)")
    .eq("plan_id", plan.id)
    .order("position");
  if (error) throw new Error(`Couldn't load the plan: ${error.message}`);
  return {
    ...plan,
    current,
    blocks: blocks.map((b) => ({
      id: b.id,
      day: b.day as Day,
      title: b.title,
      duration: b.duration,
      note: b.note,
      position: b.position,
      exercises: ((b.calisthenics_exercises ?? []) as Exercise[]).sort((x, y) => x.position - y.position),
    })),
  };
}
