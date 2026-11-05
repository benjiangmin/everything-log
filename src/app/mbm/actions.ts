"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mbm, mbmReady } from "@/mbm/supabase";
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

// ---------- Activities ----------

// Find-or-create by name; a new one gets the next color in the palette.
async function activityId(client: Awaited<ReturnType<typeof mbm>>, name: string) {
  const { count } = await client.from("activities").select("id", { count: "exact", head: true });
  const { data, error } = await client.rpc("activity_id_for", { p_name: name, p_color: PALETTE[(count ?? 0) % PALETTE.length] });
  if (error) throw new Error(error.message);
  return data as string;
}

const cleanName = (n: unknown) => String(n ?? "").replace(/\s+/g, " ").trim().slice(0, 60);

// ---------- The timeline ----------

// "I'm doing X now" (or since a few minutes ago): ends whatever you were doing.
export async function switchTo(name: string, minutesAgo = 0): Promise<Result> {
  const activity = cleanName(name);
  if (!activity) return fail("What are you doing?");
  const ago = Math.min(Math.max(0, Math.round(Number(minutesAgo) || 0)), 24 * 60);
  try {
    const client = await mbm();
    const id = await activityId(client, activity);
    // Switched again within a minute (a mis-tap, or changing your mind): fix that block instead
    // of leaving a sliver behind.
    if (!ago) {
      const { data: current } = await client.from("blocks").select("id, started_at, activity_id").is("ended_at", null).maybeSingle();
      if (current && Date.now() - +new Date(current.started_at) < 60000) {
        if (current.activity_id !== id) {
          const { error } = await client.from("blocks").update({ activity_id: id, updated_at: new Date().toISOString() }).eq("id", current.id);
          if (error) return fail(error.message);
        }
        refresh();
        return { ok: true };
      }
    }
    const { error } = await client.rpc("place_block", {
      p_start: new Date(Date.now() - ago * 60000).toISOString(),
      p_end: null,
      p_activity_id: id,
    });
    if (error) return fail(error.message);
  } catch (e) {
    return fail((e as Error).message);
  }
  refresh();
  return { ok: true };
}

// Stop tracking: ends what you're doing now (the time after it shows as untracked).
export async function stopNow(): Promise<Result> {
  const client = await mbm();
  const { error } = await client.from("blocks").update({ ended_at: new Date().toISOString(), updated_at: new Date().toISOString() }).is("ended_at", null);
  if (error) return fail(error.message);
  refresh();
  return { ok: true };
}

// Add or change a block. start / end are moments (ISO); end null = still going on now.
// An end that's later than now gets pulled back to now (the future isn't tracked yet).
export async function saveBlock(input: { id?: string; name: string; start: string; end: string | null; note?: string }): Promise<Result> {
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
  if (!isUuid(id)) return fail("That block is gone.");
  const { error } = await (await mbm()).from("blocks").delete().eq("id", id);
  if (error) return fail(error.message);
  refresh();
  return { ok: true };
}
