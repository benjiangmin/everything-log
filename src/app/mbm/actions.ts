"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mbm, mbmReady } from "@/mbm/supabase";
import { getDay, getNowInfo, type Day, type NowInfo } from "@/mbm/data";
import { PALETTE } from "@/mbm/colors";

// NOTE: the whole site also sits behind the password lock (src/proxy.ts). On top of that,
// Minute by Minute needs its own sign-in, and the database only ever shows you your own rows.

export type Result = { ok: true } | { ok: false; message: string };
const fail = (message: string): Result => ({ ok: false, message });
const isUuid = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id);

function refresh() {
  revalidatePath("/mbm");
  revalidatePath("/");
}

// ---------- Signing in ----------

export type SignInState = { message: string | null };

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  if (!mbmReady()) return { message: "Minute by Minute isn't connected yet (MBM_SUPABASE_URL / MBM_SUPABASE_PUBLISHABLE_KEY)." };
  const email = String(formData.get("email") ?? "").trim().slice(0, 200);
  const password = String(formData.get("password") ?? "").slice(0, 200);
  if (!email || !password) return { message: "Email and password, please." };
  const { error } = await (await mbm()).auth.signInWithPassword({ email, password });
  if (error) return { message: error.message === "Invalid login credentials" ? "That email and password don't match." : error.message };
  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/mbm");
}

export async function signOut() {
  await (await mbm()).auth.signOut();
  redirect("/mbm/login");
}

// ---------- For the side panels (they load when opened) ----------

export async function nowInfo(): Promise<{ ok: true; info: NowInfo } | { ok: false; message: string }> {
  try {
    return { ok: true, info: await getNowInfo() };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function dayData(dayKey: string): Promise<{ ok: true; day: Day } | { ok: false; message: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return { ok: false, message: "Pick a day." };
  try {
    return { ok: true, day: await getDay(dayKey) };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

// ---------- Activities ----------

// Find-or-create by name; a new one gets the next color in the palette.
async function activityId(client: Awaited<ReturnType<typeof mbm>>, name: string) {
  const { count } = await client.from("activities").select("id", { count: "exact", head: true });
  const { data, error } = await client.rpc("activity_id_for", { p_name: name, p_color: PALETTE[(count ?? 0) % PALETTE.length] });
  if (error) throw new Error(error.message);
  return data as string;
}

const cleanName = (n: unknown) => String(n ?? "").replace(/\s+/g, " ").trim().slice(0, 60);

// ---------- Entries ----------

// "I'm doing X". The rules live in the database (start_entry, supabase/minute-by-minute/003), so
// the website and the iPhone app behave the same:
//   since: "last" (when your last finished entry ended; switching: now), "now", or a moment (ISO).
//   stopRunning: true = Switch (stop what's running first); false = + Start (run alongside).
export async function startEntry(input: { name: string; since: "last" | "now" | string; stopRunning: boolean }): Promise<Result> {
  const activity = cleanName(input.name);
  if (!activity) return fail("What are you doing?");
  const since = input.since === "last" || input.since === "now" ? input.since : new Date(input.since);
  if (since instanceof Date && (Number.isNaN(since.getTime()) || since.getTime() > Date.now() + 60000)) return fail("That time doesn't look right.");
  const { error } = await (await mbm()).rpc("start_entry", {
    p_name: activity,
    p_since: since instanceof Date ? since.toISOString() : since,
    p_switch: input.stopRunning,
  });
  if (error) {
    return fail(/start_entry/.test(error.message) ? "Run supabase/minute-by-minute/003_start_entry.sql in the minute-by-minute project." : error.message);
  }
  refresh();
  return { ok: true };
}

// Stop one running entry now (or all of them, with no id).
export async function stopEntry(id?: string): Promise<Result> {
  const client = await mbm();
  let q = client.from("blocks").update({ ended_at: new Date().toISOString(), updated_at: new Date().toISOString() }).is("ended_at", null);
  if (id) {
    if (!isUuid(id)) return fail("That entry is gone.");
    q = q.eq("id", id);
  }
  const { error } = await q;
  if (error) return fail(error.message);
  refresh();
  return { ok: true };
}

// Add a missed entry, or change one. start / end are moments (ISO); end null = still going.
// An end later than now is pulled back to now (the future isn't tracked).
// stopRunning (new entries that are still going): end whatever else is running at its start.
export async function saveBlock(input: { id?: string; name: string; start: string; end: string | null; note?: string; stopRunning?: boolean }): Promise<Result> {
  const activity = cleanName(input.name);
  if (!activity) return fail("What were you doing?");
  const start = new Date(input.start);
  const end = input.end === null ? null : new Date(input.end);
  if (Number.isNaN(start.getTime()) || (end && Number.isNaN(end.getTime()))) return fail("Those times don't look right.");
  const now = Date.now();
  if (start.getTime() > now + 60000) return fail("That's in the future.");
  const endAt = end && end.getTime() > now ? new Date(now) : end;
  if (endAt && endAt <= start) return fail("The end has to be after the start.");

  try {
    const client = await mbm();
    const id = await activityId(client, activity);
    if (!input.id && endAt === null && input.stopRunning) {
      const { error } = await client.rpc("stop_running", { p_at: start.toISOString() });
      if (error) return fail(error.message);
    }
    const { error } = await client.rpc("place_block", {
      p_start: start.toISOString(),
      p_end: endAt?.toISOString() ?? null,
      p_activity_id: id,
      p_note: String(input.note ?? "").slice(0, 500),
      p_id: isUuid(input.id) ? input.id : null,
    });
    if (error) return fail(error.message);
  } catch (err) {
    return fail((err as Error).message);
  }
  refresh();
  return { ok: true };
}

export async function deleteBlock(id: string): Promise<Result> {
  if (!isUuid(id)) return fail("That entry is gone.");
  const { error } = await (await mbm()).from("blocks").delete().eq("id", id);
  if (error) return fail(error.message);
  refresh();
  return { ok: true };
}

// Change an activity's color (every entry of it, everywhere: the bar, the map, the phone).
export async function setActivityColor(id: string, color: string): Promise<Result> {
  if (!isUuid(id)) return fail("That activity is gone.");
  if (!/^#[0-9a-f]{6}$/i.test(color)) return fail("That isn't a color.");
  const { error } = await (await mbm()).from("activities").update({ color: color.toLowerCase() }).eq("id", id);
  if (error) return fail(error.message);
  refresh();
  return { ok: true };
}

// Name a stop on the map ("Home", "Theory"). Later stops there get the name by themselves.
export async function namePlace(visitId: string, name: string): Promise<Result> {
  if (!isUuid(visitId)) return fail("That stop is gone.");
  const clean = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!clean) return fail("What is this place called?");
  const { error } = await (await mbm()).rpc("name_place", { p_visit_id: visitId, p_name: clean });
  if (error) return fail(/name_place/.test(error.message) ? "Run supabase/minute-by-minute/005_location.sql first." : error.message);
  refresh();
  return { ok: true };
}
