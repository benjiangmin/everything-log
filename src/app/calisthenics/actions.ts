"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";

// Editing the current plan. Older plans are read-only: every change checks it's the newest.

const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const DAYS = ["daily", "mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const clean = (v: string | null | undefined, max: number) => {
  const s = String(v ?? "").trim().slice(0, max);
  return s && s !== "-" ? s : null;
};

type Result = { ok: true } | { ok: false; message: string };
const fail = (message: string): Result => ({ ok: false, message });
const done = (): Result => {
  revalidatePath("/calisthenics");
  return { ok: true };
};

async function currentPlanId(): Promise<string | null> {
  const { data } = await db().from("calisthenics_plans").select("id").order("number", { ascending: false }).limit(1).maybeSingle();
  return data?.id ?? null;
}
async function planOfBlock(blockId: string) {
  const { data } = await db().from("calisthenics_blocks").select("plan_id, day").eq("id", blockId).maybeSingle();
  return data;
}
async function blockIsCurrent(blockId: string) {
  const [b, current] = await Promise.all([planOfBlock(blockId), currentPlanId()]);
  return Boolean(b && b.plan_id === current);
}
async function exerciseBlock(id: string): Promise<string | null> {
  const { data } = await db().from("calisthenics_exercises").select("block_id").eq("id", id).maybeSingle();
  return data?.block_id ?? null;
}

// ---------- Plans ----------

// Start Plan #N+1: a copy of the current plan, or blank. The old one stays as it is.
export async function newPlan(mode: "copy" | "blank"): Promise<Result & { number?: number }> {
  const { data: latest } = await db().from("calisthenics_plans").select("id, number").order("number", { ascending: false }).limit(1).maybeSingle();
  const number = (latest?.number ?? 0) + 1;
  const { data: plan, error } = await db().from("calisthenics_plans").insert({ number }).select("id").single();
  if (error) return fail(`Couldn't start a new plan: ${error.message}`);

  if (mode === "copy" && latest) {
    const { data: blocks, error: e1 } = await db()
      .from("calisthenics_blocks")
      .select("day, title, duration, note, position, calisthenics_exercises(name, sets, load, position)")
      .eq("plan_id", latest.id);
    if (e1) return fail(`Couldn't copy: ${e1.message}`);
    for (const b of blocks) {
      const { data: nb, error: e2 } = await db()
        .from("calisthenics_blocks")
        .insert({ plan_id: plan.id, day: b.day, title: b.title, duration: b.duration, note: b.note, position: b.position })
        .select("id")
        .single();
      if (e2) return fail(`Couldn't copy: ${e2.message}`);
      const ex = (b.calisthenics_exercises ?? []) as { name: string; sets: string | null; load: string | null; position: number }[];
      if (ex.length) {
        const { error: e3 } = await db().from("calisthenics_exercises").insert(ex.map((x) => ({ ...x, block_id: nb.id })));
        if (e3) return fail(`Couldn't copy: ${e3.message}`);
      }
    }
  }
  revalidatePath("/calisthenics");
  return { ok: true, number };
}

export async function renamePlan(id: string, name: string): Promise<Result> {
  if (!isUuid(id)) return fail("Couldn't find that plan.");
  const { error } = await db().from("calisthenics_plans").update({ name: clean(name, 80) }).eq("id", id);
  return error ? fail(`Couldn't rename: ${error.message}`) : done();
}

// ---------- Blocks (a day's sections: "Push", "Abs"…) ----------

export async function addBlock(day: string): Promise<Result> {
  if (!DAYS.includes(day)) return fail("Unknown day.");
  const planId = await currentPlanId();
  if (!planId) return fail("Make a plan first.");
  const { data: last } = await db().from("calisthenics_blocks").select("position").eq("plan_id", planId).order("position", { ascending: false }).limit(1).maybeSingle();
  const { error } = await db()
    .from("calisthenics_blocks")
    .insert({ plan_id: planId, day, title: "New block", position: (last?.position ?? -1) + 1 });
  return error ? fail(`Couldn't add: ${error.message}`) : done();
}

export async function updateBlock(id: string, fields: { title?: string; duration?: string; note?: string }): Promise<Result> {
  if (!isUuid(id) || !(await blockIsCurrent(id))) return fail("Only the current plan can be changed.");
  const values: Record<string, string | null> = {};
  if (fields.title !== undefined) values.title = clean(fields.title, 80) ?? "Untitled";
  if (fields.duration !== undefined) values.duration = clean(fields.duration, 40);
  if (fields.note !== undefined) values.note = clean(fields.note, 200);
  const { error } = await db().from("calisthenics_blocks").update(values).eq("id", id);
  return error ? fail(`Couldn't save: ${error.message}`) : done();
}

export async function deleteBlock(id: string): Promise<Result> {
  if (!isUuid(id) || !(await blockIsCurrent(id))) return fail("Only the current plan can be changed.");
  const { error } = await db().from("calisthenics_blocks").delete().eq("id", id);
  return error ? fail(`Couldn't delete: ${error.message}`) : done();
}

// Up or down among the same day's blocks.
export async function moveBlock(id: string, dir: -1 | 1): Promise<Result> {
  if (!isUuid(id) || !(await blockIsCurrent(id))) return fail("Only the current plan can be changed.");
  const b = await planOfBlock(id);
  if (!b) return fail("Couldn't find that block.");
  const { data: rows } = await db().from("calisthenics_blocks").select("id, position").eq("plan_id", b.plan_id).eq("day", b.day).order("position");
  return swap("calisthenics_blocks", rows ?? [], id, dir);
}

// ---------- Exercises ----------

export async function addExercise(blockId: string): Promise<Result> {
  if (!isUuid(blockId) || !(await blockIsCurrent(blockId))) return fail("Only the current plan can be changed.");
  const { data: last } = await db().from("calisthenics_exercises").select("position").eq("block_id", blockId).order("position", { ascending: false }).limit(1).maybeSingle();
  const { error } = await db().from("calisthenics_exercises").insert({ block_id: blockId, name: "New exercise", position: (last?.position ?? -1) + 1 });
  return error ? fail(`Couldn't add: ${error.message}`) : done();
}

export async function updateExercise(id: string, fields: { name?: string; sets?: string; load?: string }): Promise<Result> {
  const blockId = isUuid(id) ? await exerciseBlock(id) : null;
  if (!blockId || !(await blockIsCurrent(blockId))) return fail("Only the current plan can be changed.");
  const values: Record<string, string | null> = {};
  if (fields.name !== undefined) values.name = clean(fields.name, 120) ?? "Untitled";
  if (fields.sets !== undefined) values.sets = clean(fields.sets, 40);
  if (fields.load !== undefined) values.load = clean(fields.load, 40);
  const { error } = await db().from("calisthenics_exercises").update(values).eq("id", id);
  return error ? fail(`Couldn't save: ${error.message}`) : done();
}

export async function deleteExercise(id: string): Promise<Result> {
  const blockId = isUuid(id) ? await exerciseBlock(id) : null;
  if (!blockId || !(await blockIsCurrent(blockId))) return fail("Only the current plan can be changed.");
  const { error } = await db().from("calisthenics_exercises").delete().eq("id", id);
  return error ? fail(`Couldn't delete: ${error.message}`) : done();
}

export async function moveExercise(id: string, dir: -1 | 1): Promise<Result> {
  const blockId = isUuid(id) ? await exerciseBlock(id) : null;
  if (!blockId || !(await blockIsCurrent(blockId))) return fail("Only the current plan can be changed.");
  const { data: rows } = await db().from("calisthenics_exercises").select("id, position").eq("block_id", blockId).order("position");
  return swap("calisthenics_exercises", rows ?? [], id, dir);
}

// Swap a row with its neighbour (renumbering the list so positions are always 0, 1, 2…).
async function swap(table: string, rows: { id: string; position: number }[], id: string, dir: -1 | 1): Promise<Result> {
  const i = rows.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length) return { ok: true };
  const order = rows.map((r) => r.id);
  [order[i], order[j]] = [order[j], order[i]];
  const results = await Promise.all(order.map((rid, position) => db().from(table).update({ position }).eq("id", rid)));
  const err = results.find((r) => r.error)?.error;
  return err ? fail(`Couldn't move: ${err.message}`) : done();
}
