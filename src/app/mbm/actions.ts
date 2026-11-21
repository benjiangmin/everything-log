"use server";

import { googleStatus, syncCalendar } from "@/mbm/google";
import { buildingAt, contains } from "@/mbm/buildings";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { mbm, mbmReady } from "@/mbm/supabase";
import { getDay, getNowInfo, mbmTz, type Day, type LockedTrip, type NowInfo } from "@/mbm/data";
import { PALETTE } from "@/mbm/colors";
import { dayKeyOf, dayRange } from "@/mbm/time";

// NOTE: the whole site also sits behind the password lock (src/proxy.ts). On top of that,
// Minute by Minute needs its own sign-in, and the database only ever shows you your own rows.

export type Result = { ok: true } | { ok: false; message: string };
const fail = (message: string): Result => ({ ok: false, message });
const isUuid = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id);

function refresh() {
  revalidatePath("/mbm", "layout"); // Home, Day and Stats
  revalidatePath("/");
}

// ---------- Signing in ----------

export type SignInState = { message: string | null; sent?: boolean };

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

// A new account. If the project asks people to confirm their email first, there's no session
// yet: say so (the link in the email brings them back to sign in).
export async function signUp(_prev: SignInState, formData: FormData): Promise<SignInState> {
  if (!mbmReady()) return { message: "Minute by Minute isn't connected yet (MBM_SUPABASE_URL / MBM_SUPABASE_PUBLISHABLE_KEY)." };
  const email = String(formData.get("email") ?? "").trim().slice(0, 200);
  const password = String(formData.get("password") ?? "").slice(0, 200);
  if (!email || !password) return { message: "Email and password, please." };
  if (password.length < 8) return { message: "Pick a password with at least 8 characters." };
  const origin = (await headers()).get("origin") ?? "";
  const { data, error } = await (await mbm()).auth.signUp({ email, password, options: { emailRedirectTo: origin ? `${origin}/mbm/login` : undefined } });
  if (error) return { message: /registered/i.test(error.message) ? "There's already an account with that email. Sign in instead." : error.message };
  if (!data.session) return { message: null, sent: true };
  redirect("/mbm");
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
  await matchCase(client, name);
  const { count } = await client.from("activities").select("id", { count: "exact", head: true });
  const { data, error } = await client.rpc("activity_id_for", { p_name: name, p_color: PALETTE[(count ?? 0) % PALETTE.length] });
  if (error) throw new Error(error.message);
  return data as string;
}

// You typed a name that only differs in capitals from one you have ("Working on this project"
// vs "working on this project"): it's the same activity, renamed to how you typed it now.
async function matchCase(client: Awaited<ReturnType<typeof mbm>>, name: string) {
  const { data } = await client.from("activities").select("id, name");
  const same = (data ?? []).find((a) => a.name.trim().toLowerCase() === name.toLowerCase() && a.name.trim() !== name);
  if (same) await client.from("activities").update({ name }).eq("id", same.id);
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
  const client = await mbm();
  await matchCase(client, activity);
  const { error } = await client.rpc("start_entry", {
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
  const client = await mbm();
  // An automatic entry (a Commute from your location): remember it's unwanted, so rebuilding
  // the day doesn't make it again (014; skipped if not run yet).
  const { data: b } = await client.from("blocks").select("started_at, ended_at, source").eq("id", id).maybeSingle();
  if (b && (b as { source: string }).source === "location") {
    const { started_at, ended_at } = b as { started_at: string; ended_at: string | null };
    await client.from("dismissed").upsert({ started_at, ended_at: ended_at ?? new Date().toISOString() });
  }
  const { error } = await client.from("blocks").delete().eq("id", id);
  if (error) return fail(error.message);
  refresh();
  return { ok: true };
}

// Two entries of the same job, one after the other, become one: from the first one's start to
// the last one's end (still running if either is), notes joined, the place kept (the first's,
// else the other's). The second is deleted.
export async function mergeBlocks(a: string, b: string): Promise<Result> {
  if (!isUuid(a) || !isUuid(b) || a === b) return fail("Those entries are gone.");
  const client = await mbm();
  const { data, error } = await client.from("blocks").select("id, started_at, ended_at, activity_id, note, place_id").in("id", [a, b]);
  if (error) return fail(error.message);
  type B = { id: string; started_at: string; ended_at: string | null; activity_id: string | null; note: string | null; place_id: string | null };
  const both = ((data ?? []) as B[]).sort((x, y) => +new Date(x.started_at) - +new Date(y.started_at));
  if (both.length !== 2) return fail("One of those entries is gone.");
  const [first, second] = both;
  if (!first.activity_id || first.activity_id !== second.activity_id) return fail("Only entries of the same job can be merged.");
  const end = first.ended_at === null || second.ended_at === null ? null : new Date(Math.max(+new Date(first.ended_at), +new Date(second.ended_at))).toISOString();
  const notes = [first.note, second.note].map((n) => n?.trim()).filter((n): n is string => !!n);
  const note = [...new Set(notes)].join(" · ") || null;
  const { error: upErr } = await client
    .from("blocks")
    .update({ ended_at: end, note, place_id: first.place_id ?? second.place_id, updated_at: new Date().toISOString() })
    .eq("id", first.id);
  if (upErr) return fail(upErr.message);
  const { error: delErr } = await client.from("blocks").delete().eq("id", second.id);
  if (delErr) return fail(delErr.message);
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

// A route you walked before between these two stops' places, for a trip the phone missed (null if
// there isn't one, or 008_smarter_trips.sql hasn't been run).
export async function rememberedRoute(fromId: string, toId: string): Promise<{ lat: number; lng: number }[] | null> {
  if (!isUuid(fromId) || !isUuid(toId)) return null;
  const { data, error } = await (await mbm()).rpc("route_between", { p_from: fromId, p_to: toId });
  if (error || !Array.isArray(data) || data.length < 2) return null;
  return (data as { lat: number; lng: number }[]).map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }));
}

// Move entries' start / end (dragging their edges on the day bar). Everything else about them
// stays. end undefined = leave it (a running entry keeps running).
export async function retimeBlocks(changes: { id: string; start?: string; end?: string }[]): Promise<Result> {
  const now = Date.now() + 60000;
  for (const c of changes) {
    if (!isUuid(c.id)) return fail("That entry is gone.");
    for (const t of [c.start, c.end]) {
      if (t !== undefined && (Number.isNaN(new Date(t).getTime()) || new Date(t).getTime() > now)) return fail("That time doesn't work.");
    }
    if (c.start && c.end && new Date(c.end) <= new Date(c.start)) return fail("The end has to be after the start.");
  }
  const client = await mbm();
  for (const c of changes) {
    const patch: Record<string, string> = { updated_at: new Date().toISOString() };
    if (c.start) patch.started_at = new Date(c.start).toISOString();
    if (c.end) patch.ended_at = new Date(c.end).toISOString();
    const { error } = await client.from("blocks").update(patch).eq("id", c.id);
    if (error) return fail(/check/.test(error.message) ? "The end has to be after the start." : error.message);
  }
  refresh();
  return { ok: true };
}

// ---------- Where an entry happened ----------

export type PlaceLite = { id: string; name: string; lat: number; lng: number; real_name?: string | null; real_address?: string | null };
export type EntryPlaceInfo = {
  places: PlaceLite[]; // all your named places
  current: PlaceLite | null; // the place you set on this entry
  phone: { name: string | null; lat: number; lng: number } | null; // where the phone had you then
  usual: PlaceLite | null; // where this activity usually happens (from entries you've set)
  ready: boolean; // false until 009_entry_places.sql is run
};

export async function entryPlaceInfo(blockId: string): Promise<EntryPlaceInfo> {
  const none: EntryPlaceInfo = { places: [], current: null, phone: null, usual: null, ready: false };
  if (!isUuid(blockId)) return none;
  const client = await mbm();
  const block = await client.from("blocks").select("id, started_at, ended_at, activity_id, place_id").eq("id", blockId).maybeSingle();
  if (block.error || !block.data) return none; // (place_id missing = 009 not run yet)
  const b = block.data as { started_at: string; ended_at: string | null; activity_id: string | null; place_id: string | null };
  const end = b.ended_at ?? new Date().toISOString();
  const [places, visits, past] = await Promise.all([
    client
      .from("places")
      .select("id, name, lat, lng, real_name, real_address")
      .order("name")
      .then((r) => (r.error ? client.from("places").select("id, name, lat, lng").order("name") : r)), // (047 not run yet)
    client.from("visits").select("arrived_at, departed_at, lat, lng, auto_name, places(name)").lt("arrived_at", end).or(`departed_at.is.null,departed_at.gt.${b.started_at}`),
    b.activity_id
      ? client.from("blocks").select("place_id").eq("activity_id", b.activity_id).not("place_id", "is", null).neq("id", blockId).limit(200)
      : Promise.resolve({ data: [] as { place_id: string }[], error: null }),
  ]);
  const all = (places.data ?? []) as PlaceLite[];
  const byId = new Map(all.map((p) => [p.id, p]));
  // The phone's stop that covers most of the entry.
  type V = { arrived_at: string; departed_at: string | null; lat: number; lng: number; auto_name: string | null; places: { name: string } | { name: string }[] | null };
  const s = +new Date(b.started_at);
  const e = +new Date(end);
  const overlap = (v: V) => Math.min(e, v.departed_at ? +new Date(v.departed_at) : e) - Math.max(s, +new Date(v.arrived_at));
  const best = ((visits.data ?? []) as unknown as V[]).sort((x, y) => overlap(y) - overlap(x))[0];
  const placeName = best && (Array.isArray(best.places) ? best.places[0]?.name : best.places?.name);
  // The place this activity has most often.
  const counts = new Map<string, number>();
  for (const r of (past.data ?? []) as { place_id: string }[]) counts.set(r.place_id, (counts.get(r.place_id) ?? 0) + 1);
  const top = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
  return {
    places: all,
    current: b.place_id ? (byId.get(b.place_id) ?? null) : null,
    phone: best ? { name: placeName ?? best.auto_name ?? null, lat: best.lat, lng: best.lng } : null,
    usual: top ? (byId.get(top) ?? null) : null,
    ready: true,
  };
}

// Say where an entry happened (null = not set). The phone's stops for that time move to match.
export async function setEntryPlace(blockId: string, placeId: string | null): Promise<Result> {
  if (!isUuid(blockId) || (placeId !== null && !isUuid(placeId))) return fail("That's gone.");
  const client = await mbm();
  const { error } = await client.rpc("set_entry_place", { p_block_id: blockId, p_place_id: placeId });
  if (error) return fail(/set_entry_place/.test(error.message) ? "Run supabase/minute-by-minute/009_entry_places.sql first." : error.message);
  // The walk to / from the stops next to it becomes a Commute (010; skipped if not run yet).
  if (placeId) await client.rpc("link_entry_stops", { p_block_id: blockId });
  if (placeId) {
    // Your choice stays: the phone's next sync doesn't work these stops out again (it used to put
    // the Extension Bldg's Book Store back). And a spot the phone misread is learned (054).
    const { data: b } = await client.from("blocks").select("started_at, ended_at").eq("id", blockId).maybeSingle();
    if (b) {
      const blk = b as { started_at: string; ended_at: string | null };
      let q = client.from("visits").select("id").eq("place_id", placeId).gt("departed_at", blk.started_at);
      if (blk.ended_at) q = q.lt("arrived_at", blk.ended_at);
      const { data: vs } = await q;
      const { data: open } = await client.from("visits").select("id").eq("place_id", placeId).is("departed_at", null).lt("arrived_at", blk.ended_at ?? "infinity");
      const ids = [...new Set([...(vs ?? []), ...(open ?? [])].map((v) => (v as { id: string }).id))];
      if (ids.length) {
        await client.from("visits").update({ pinned: true }).in("id", ids);
        for (const id of ids) await learnMisread(id);
      }
    }
  }
  refresh();
  return { ok: true };
}

// Where your phone really had you for a stop, or for the stops during an entry: the middle of
// its still dots (a stop set to a place shows the place's spot, not the phone's). For checking
// a place you pick is next to it (nearcheck.ts). The place: its spot and building.
export async function nearCheckInfo(
  of: { visitId?: string; blockId?: string },
  place: { placeId?: string; lat?: number; lng?: number },
): Promise<{ spots: [number, number][]; target: { lat: number; lng: number; outline: [number, number][] | null } | null }> {
  const client = await mbm();
  let target: { lat: number; lng: number; outline: [number, number][] | null } | null = null;
  if (place.placeId && isUuid(place.placeId)) {
    const { data } = await client.from("places").select("lat, lng, outline").eq("id", place.placeId).maybeSingle();
    if (data) target = data as { lat: number; lng: number; outline: [number, number][] | null };
  } else if ([place.lat, place.lng].every((v) => typeof v === "number" && Number.isFinite(v))) {
    target = { lat: place.lat!, lng: place.lng!, outline: null };
  }
  type V = { id: string; arrived_at: string; departed_at: string | null; lat: number; lng: number; place_id: string | null };
  let stops: V[] = [];
  if (of.visitId && isUuid(of.visitId)) {
    const { data } = await client.from("visits").select("id, arrived_at, departed_at, lat, lng, place_id").eq("id", of.visitId);
    stops = (data ?? []) as V[];
  } else if (of.blockId && isUuid(of.blockId)) {
    const { data: b } = await client.from("blocks").select("started_at, ended_at").eq("id", of.blockId).maybeSingle();
    if (b) {
      const blk = b as { started_at: string; ended_at: string | null };
      let q = client.from("visits").select("id, arrived_at, departed_at, lat, lng, place_id").or(`departed_at.is.null,departed_at.gt.${blk.started_at}`);
      if (blk.ended_at) q = q.lt("arrived_at", blk.ended_at);
      stops = ((await q).data ?? []) as V[];
    }
  }
  const spots: [number, number][] = [];
  for (const v of stops) {
    const { data: dots } = await client
      .from("points")
      .select("lat, lng")
      .gte("at", v.arrived_at)
      .lte("at", v.departed_at ?? new Date().toISOString())
      .lte("speed_mps", 0.8)
      .limit(2000);
    const d = (dots ?? []) as { lat: number; lng: number }[];
    const mid = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    if (d.length >= 3) spots.push([mid(d.map((p) => p.lat)), mid(d.map((p) => p.lng))]);
    else if (!v.place_id) spots.push([v.lat, v.lng]); // (no dots: where the phone put it, unless that's a place's spot)
  }
  return { spots, target };
}

// A new place (picked on the map), set on the entry.
export async function newPlaceForEntry(blockId: string, name: string, lat: number, lng: number): Promise<Result> {
  const clean = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!clean) return fail("What is this place called?");
  if (![lat, lng].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return fail("Pick a spot on the map.");
  const { data, error } = await (await mbm()).rpc("create_place", { p_name: clean, p_lat: lat, p_lng: lng });
  if (error) return fail(/create_place/.test(error.message) ? "Run supabase/minute-by-minute/009_entry_places.sql first." : error.message);
  return setEntryPlace(blockId, data as string);
}

// Move a stop to where it really was: only this stop, never the place (its other stops stay).
// Only next to where the phone had you (checked before this, in nearcheck.ts), like dragging a
// pickup spot. Dropped outside its place's building: it's not that place any more.
export async function moveStop(visitId: string, lat: number, lng: number): Promise<Result> {
  if (!isUuid(visitId)) return fail("That stop is gone.");
  if (![lat, lng].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return fail("Click a spot on the map.");
  const client = await mbm();
  await unlockDaysOf(client, visitId);
  const { data: v, error } = await client.from("visits").select("id, place_id").eq("id", visitId).maybeSingle();
  if (error) return fail(error.message);
  if (!v) return fail("That stop is gone.");
  const placeId = (v as { place_id: string | null }).place_id;
  let stays = false;
  if (placeId) {
    const { data: pl } = await client.from("places").select("outline").eq("id", placeId).maybeSingle();
    const o = (pl as { outline: [number, number][] | null } | null)?.outline;
    stays = !!o && o.length >= 3 && contains(o, lat, lng);
  }
  // (Pinned: so the phone's next update doesn't move it back. Its building is looked up again.)
  const moved = (
    await client
      .from("visits")
      .update({ lat, lng, pinned: true, outline: null, outline_checked: false, ...(placeId && !stays ? { place_id: null, auto_name: null } : {}) })
      .eq("id", visitId)
  ).error;
  if (moved) return fail(moved.message);
  refresh();
  return { ok: true };
}

// Remove a stop the phone made up (the trips around it join up).
export async function removeStop(visitId: string): Promise<Result> {
  if (!isUuid(visitId)) return fail("That stop is gone.");
  const client = await mbm();
  await unlockDaysOf(client, visitId);
  // A LocoKit stop: remember it's removed, or the phone sends it back (016_locokit.sql).
  const { data: v } = await client.from("visits").select("lk_id").eq("id", visitId).maybeSingle();
  const lk = (v as { lk_id?: string | null } | null)?.lk_id;
  if (lk) {
    const { error } = await client.from("lk_removed").upsert({ lk_id: lk });
    if (error) return fail(error.message);
  }
  const { error } = await client.from("visits").delete().eq("id", visitId);
  if (error) return fail(error.message);
  refresh();
  return { ok: true };
}

// You said where a stop really was: if the phone had you somewhere else, that spot is learned
// as the phone misreading this place (054_learned_misreads.sql; fine if that's not run yet).
async function learnMisread(visitId: string) {
  await (await mbm()).rpc("learn_misread", { p_visit: visitId }).then(() => undefined, () => undefined);
}

// Name a stop on the map ("Home", "Theory"). Later stops there get the name by themselves.
export async function namePlace(visitId: string, name: string): Promise<Result> {
  if (!isUuid(visitId)) return fail("That stop is gone.");
  const clean = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!clean) return fail("What is this place called?");
  await unlockDaysOf(await mbm(), visitId);
  const { error } = await (await mbm()).rpc("name_place", { p_visit_id: visitId, p_name: clean });
  if (error) return fail(/name_place/.test(error.message) ? "Run supabase/minute-by-minute/005_location.sql first." : error.message);
  await learnMisread(visitId);
  refresh();
  return { ok: true };
}

// ---------- Search (the top bar) ----------

export type SearchHit =
  | { kind: "activity"; name: string; color: string; href: string; detail: string }
  | { kind: "entry"; name: string; color: string; note: string | null; href: string; detail: string }
  | { kind: "place"; name: string; href: string; detail: string }
  | { kind: "app"; name: string; href: string; detail: string };

// Everything with something called q: your activities, entries (by activity or note), places
// you've been and apps you've used. A word has to start with what you typed ("work" finds
// "Working…", "k" doesn't).
export async function searchEverything(q: string): Promise<SearchHit[]> {
  const text = String(q ?? "").replace(/[%_,()*\\"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!text || !mbmReady()) return [];
  const client = await mbm();
  const tz = process.env.MBM_TIMEZONE || "America/Chicago";
  const lower = text.toLowerCase();
  const wordStart = (s: string | null | undefined) => Boolean(s && (" " + s.toLowerCase()).includes(" " + lower));
  const dayOf = (at: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
  const when = (at: string) => new Date(at).toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric" });
  const like = `%${text}%`;

  const [acts, notes, visits, apps] = await Promise.all([
    client.from("activities").select("id, name, color, last_used_at").ilike("name", like).limit(30),
    client.from("blocks").select("id, started_at, activity_id, note").ilike("note", like).order("started_at", { ascending: false }).limit(20),
    client.from("visits").select("arrived_at, auto_name, places(name)").order("arrived_at", { ascending: false }).limit(2000),
    client.from("phone_use").select("app, started_at").eq("kind", "app").ilike("app", like).order("started_at", { ascending: false }).limit(500),
  ]);

  const activities = (acts.data ?? []).filter((a) => wordStart(a.name));
  const colorOf = new Map((acts.data ?? []).map((a) => [a.id, a.color as string]));
  const nameOf = new Map((acts.data ?? []).map((a) => [a.id, a.name as string]));
  const hits: SearchHit[] = [];

  for (const a of activities.slice(0, 5)) {
    hits.push({
      kind: "activity",
      name: a.name,
      color: a.color,
      href: `/mbm/stats?range=year&q=${encodeURIComponent(a.name)}`,
      detail: a.last_used_at ? `Last ${when(a.last_used_at)}` : "Activity",
    });
  }

  // Entries: of those activities (latest few), and any with the words in their note.
  const ids = activities.map((a) => a.id);
  const ofActs = ids.length
    ? await client.from("blocks").select("id, started_at, activity_id, note").in("activity_id", ids).order("started_at", { ascending: false }).limit(5)
    : { data: [] as { id: string; started_at: string; activity_id: string | null; note: string | null }[] };
  const noteHits = (notes.data ?? []).filter((b) => wordStart(b.note));
  const missing = noteHits.map((b) => b.activity_id).filter((id): id is string => Boolean(id) && !nameOf.has(id as string));
  if (missing.length) {
    const { data } = await client.from("activities").select("id, name, color").in("id", missing);
    for (const a of data ?? []) {
      nameOf.set(a.id, a.name);
      colorOf.set(a.id, a.color);
    }
  }
  const seen = new Set<string>();
  for (const b of [...noteHits, ...(ofActs.data ?? [])]) {
    if (seen.has(b.id) || seen.size >= 6) continue;
    seen.add(b.id);
    hits.push({
      kind: "entry",
      name: (b.activity_id && nameOf.get(b.activity_id)) || "Something",
      color: (b.activity_id && colorOf.get(b.activity_id)) || "#86705f",
      note: b.note || null,
      href: `/mbm/day?day=${dayOf(b.started_at)}`,
      detail: `${when(b.started_at)} · ${new Date(b.started_at).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })}`,
    });
  }

  // Places: by name (yours, or the one the phone found), with how often and when last.
  const places = new Map<string, { last: string; n: number }>();
  for (const v of visits.data ?? []) {
    const place = (v.places as unknown as { name: string } | null)?.name ?? v.auto_name;
    if (!wordStart(place)) continue;
    const p = places.get(place!);
    if (p) p.n++;
    else places.set(place!, { last: v.arrived_at, n: 1 });
  }
  for (const [name, p] of [...places].slice(0, 5)) {
    hits.push({ kind: "place", name, href: `/mbm/day?day=${dayOf(p.last)}`, detail: `${p.n} visit${p.n === 1 ? "" : "s"} · last ${when(p.last)}` });
  }

  // Apps: when last used.
  const appsSeen = new Map<string, string>();
  for (const u of apps.data ?? []) if (u.app && wordStart(u.app) && !appsSeen.has(u.app)) appsSeen.set(u.app, u.started_at);
  for (const [name, last] of [...appsSeen].slice(0, 5)) {
    hits.push({ kind: "app", name, href: `/mbm/stats?range=day&day=${dayOf(last)}`, detail: `App · last used ${when(last)}` });
  }
  return hits;
}

// Pin / unpin an activity on the Stats page's "Time spent" (023_pins.sql).
export async function setPinned(name: string, pinned: boolean): Promise<Result> {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!clean) return { ok: false, message: "Pin what?" };
  const client = await mbm();
  const { error } = pinned
    ? await client.from("stat_pins").upsert({ name: clean }, { onConflict: "user_id,name", ignoreDuplicates: true })
    : await client.from("stat_pins").delete().ilike("name", clean.replace(/[\\%_]/g, (c) => "\\" + c));
  if (error) return { ok: false, message: /stat_pins/.test(error.message) ? "Run supabase/minute-by-minute/023_pins.sql first." : error.message };
  revalidatePath("/mbm/stats");
  return { ok: true };
}

// Your trails near a day's route, from your walks before it (028_trails.sql): how the map learns
// the lines you usually walk. [] if there's nothing yet (or 028 isn't run).
export async function trailCells(box: { minLat: number; maxLat: number; minLng: number; maxLng: number }, before: string) {
  const ok = [box.minLat, box.maxLat, box.minLng, box.maxLng].every(Number.isFinite) && box.maxLat - box.minLat < 1 && box.maxLng - box.minLng < 1;
  if (!ok || Number.isNaN(new Date(before).getTime())) return [];
  const { data, error } = await (await mbm()).rpc("trail_cells", {
    p_min_lat: box.minLat,
    p_max_lat: box.maxLat,
    p_min_lng: box.minLng,
    p_max_lng: box.maxLng,
    p_before: new Date(before).toISOString(),
  });
  if (error || !Array.isArray(data)) return [];
  return (data as number[][]).map(([lat, lng, n, c2, s2]) => ({ lat: Number(lat), lng: Number(lng), n: Number(n), c2: Number(c2), s2: Number(s2) }));
}

// "This route looks wrong" (029_route_reports.sql): what was drawn, the dots it came from, and
// your note. The cases routes get tested against.
export async function reportRoute(r: {
  start: number;
  end: number;
  fromId?: string | null;
  toId?: string | null;
  note: string;
  drawn: { lat: number; lng: number }[][];
  dots: [string, number, number, number | null, number | null][];
  legs: { mode: string; start: number; end: number }[];
  version: string;
  stars?: number | null;
}): Promise<Result> {
  if (!Number.isFinite(r.start) || !Number.isFinite(r.end) || r.end < r.start) return fail("That trip doesn't work.");
  const stars = r.stars == null ? null : Math.round(r.stars);
  if (stars !== null && !(stars >= 1 && stars <= 5)) return fail("Pick 1 to 5 stars.");
  const round = (v: number) => Math.round(v * 1e6) / 1e6;
  const client = await mbm();
  const fromVisit = r.fromId && isUuid(r.fromId) ? r.fromId : null;
  const toVisit = r.toId && isUuid(r.toId) ? r.toId : null;
  // Rated: which places it ran between (055), and a new rating of the same trip replaces the old.
  let places: { from_place?: string | null; to_place?: string | null; stars?: number } = {};
  if (stars !== null) {
    const ids = [fromVisit, toVisit].filter((x): x is string => !!x);
    const { data } = ids.length ? await client.from("visits").select("id, place_id").in("id", ids) : { data: [] };
    const placeOf = (id: string | null) => (id ? ((data ?? []) as { id: string; place_id: string | null }[]).find((v) => v.id === id)?.place_id ?? null : null);
    places = { from_place: placeOf(fromVisit), to_place: placeOf(toVisit), stars };
    await client.from("route_reports").delete().eq("trip_start", new Date(r.start).toISOString()).eq("trip_end", new Date(r.end).toISOString()).not("stars", "is", null);
  }
  const { error } = await client.from("route_reports").insert({
    ...places,
    trip_start: new Date(r.start).toISOString(),
    trip_end: new Date(r.end).toISOString(),
    from_visit: fromVisit,
    to_visit: toVisit,
    note: r.note.trim().slice(0, 2000) || null,
    drawn: r.drawn.slice(0, 50).map((line) => line.slice(0, 5000).map((p) => [round(p.lat), round(p.lng)])),
    dots: r.dots.slice(0, 10000),
    legs: r.legs.slice(0, 200),
    version: r.version.slice(0, 40),
  });
  if (error) {
    if (/stars|from_place|to_place/.test(error.message)) return fail("Run supabase/minute-by-minute/055_rate_routes.sql first.");
    return fail(/route_reports/.test(error.message) ? "Run supabase/minute-by-minute/029_route_reports.sql first." : error.message);
  }
  return { ok: true };
}

// Routes you gave 4-5 stars between the places of these two stops (055). reversed: drawn the
// other way round. spread: how sure the phone was when it was recorded (metres), for the fit check.
export async function trustedRoutes(fromId: string, toId: string): Promise<{ line: { lat: number; lng: number }[]; reversed: boolean; spread: number | null }[]> {
  if (!isUuid(fromId) || !isUuid(toId)) return [];
  const { data, error } = await (await mbm()).rpc("trusted_routes", { p_from: fromId, p_to: toId });
  if (error || !Array.isArray(data)) return [];
  return (data as { drawn: [number, number][][]; reversed: boolean; spread_m: number | null }[]).map((r) => ({
    line: (r.drawn ?? []).flat().map(([lat, lng]) => ({ lat: Number(lat), lng: Number(lng) })),
    reversed: !!r.reversed,
    spread: r.spread_m == null ? null : Number(r.spread_m),
  }));
}

// ---------- Best guesses (030_suggestions.sql) ----------

export type Guess = { activity_id: string; name: string; color: string; confidence: number; why: string[] };

// Up to two best guesses for right now (where you are: the stop you're at). Brings Google
// Calendar up to date first, at most every 10 minutes. [] if there's nothing to go on yet.
export async function bestGuesses(): Promise<Guess[]> {
  const client = await mbm();
  await syncCalendar(client).catch(() => null);
  const { data, error } = await client.rpc("suggest", { p_at: new Date().toISOString(), p_tz: mbmTz(), p_limit: 2 });
  if (error || !Array.isArray(data)) return [];
  return (data as Guess[]).slice(0, 2);
}

// Google Calendar: connected? (null: 030 isn't run yet)
export async function googleInfo() {
  return googleStatus(await mbm());
}

export async function disconnectGoogle(): Promise<Result> {
  const client = await mbm();
  const { error } = await client.from("google_accounts").delete().not("user_id", "is", null);
  if (error) return fail(error.message);
  await client.from("calendar_events").delete().not("user_id", "is", null);
  refresh();
  return { ok: true };
}

// A place's building, found by your browser (OpenStreetMap), or null: it isn't in one
// (032_places_by_building.sql). Then "at this place" means "in this building", whatever its size.
export async function setPlaceOutline(placeId: string, outline: [number, number][] | null): Promise<Result> {
  if (!isUuid(placeId)) return fail("Bad place.");
  const clean = outline && outline.length >= 3 && outline.length <= 2000 ? outline.map(([a, b]) => [Math.round(a * 1e7) / 1e7, Math.round(b * 1e7) / 1e7]) : null;
  const { error } = await (await mbm()).rpc("set_place_outline", { p_place: placeId, p_outline: clean });
  if (error) return fail(/set_place_outline/.test(error.message) ? "Run supabase/minute-by-minute/032_places_by_building.sql first." : error.message);
  return { ok: true };
}

// The same building lookup, from the website's server (when your browser couldn't reach
// OpenStreetMap). Saves it too. "busy": try again later.
export async function lookupPlaceOutline(placeId: string, lat: number, lng: number): Promise<"found" | "none" | "busy" | string> {
  if (!isUuid(placeId) || !Number.isFinite(lat) || !Number.isFinite(lng)) return "Bad place.";
  const outline = await buildingAt(lat, lng, undefined, 45);
  if (outline === undefined) return "busy";
  const res = await setPlaceOutline(placeId, outline);
  return res.ok ? (outline ? "found" : "none") : res.message;
}

// ---------- Finished days keep their routes (034_locked_days.sql) ----------

// Save a finished day's drawn routes, so it's never worked out again (the first save stays).
export async function lockDay(dayKey: string, trips: LockedTrip[]): Promise<Result> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey) || !Array.isArray(trips)) return fail("Bad day.");
  const { end } = dayRange(dayKey, mbmTz());
  if (end.getTime() > Date.now() - 3 * 3600_000) return fail("That day isn't over yet.");
  const { error } = await (await mbm())
    .from("day_locks")
    .upsert({ day: dayKey, trips: trips.slice(0, 300), version: "routes-v1" }, { onConflict: "user_id,day", ignoreDuplicates: true });
  if (error) return fail(/day_locks/.test(error.message) ? "Run supabase/minute-by-minute/034_locked_days.sql first." : error.message);
  return { ok: true };
}

// "Redraw": the day is worked out again (and saved again once it's drawn).
export async function unlockDay(dayKey: string): Promise<Result> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return fail("Bad day.");
  const { error } = await (await mbm()).from("day_locks").delete().eq("day", dayKey);
  if (error) return fail(error.message);
  refresh();
  return { ok: true };
}

// Changing a stop (moving, renaming, removing it) unlocks the days it's on.
async function unlockDaysOf(client: Awaited<ReturnType<typeof mbm>>, visitId: string) {
  const { data } = await client.from("visits").select("arrived_at, departed_at").eq("id", visitId).maybeSingle();
  const v = data as { arrived_at: string; departed_at: string | null } | null;
  if (!v) return;
  const tz = mbmTz();
  const from = dayKeyOf(new Date(v.arrived_at), tz);
  const to = dayKeyOf(new Date(v.departed_at ?? Date.now()), tz);
  await client.from("day_locks").delete().gte("day", from).lte("day", to);
}

// ---------- About you (038_about_you.sql) ----------
// Saved from the Future page's form (or the phone's first-run setup). Everything's optional.
export async function saveProfile(formData: FormData): Promise<Result> {
  if (!mbmReady()) return fail("Not connected.");
  const { RACES, STATES, EDUCATION, SMOKING, EXERCISE } = await import("@/mbm/life");
  const text = (k: string, n: number) => String(formData.get(k) ?? "").trim().slice(0, n) || null;
  const birthday = text("birthday", 10);
  if (birthday && (!/^\d{4}-\d{2}-\d{2}$/.test(birthday) || +new Date(birthday) > Date.now() || birthday < "1900-01-02")) return fail("That birthday doesn't look right.");
  const sex = text("sex", 6);
  const race = text("race", 10);
  const state = text("state", 40);
  const row = {
    name: text("name", 80),
    birthday,
    sex: sex === "female" || sex === "male" ? sex : null,
    race: RACES.some((r) => r.id === race) ? race : null,
    state: state && state in STATES ? state : null,
    education: EDUCATION.find((x) => x.id === text("education", 20))?.id ?? null,
    smoking: SMOKING.find((x) => x.id === text("smoking", 20))?.id ?? null,
    exercise: EXERCISE.find((x) => x.id === text("exercise", 20))?.id ?? null,
    skipped: false,
    updated_at: new Date().toISOString(),
  };
  const client = await mbm();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return fail("Sign in again.");
  let { error } = await client.from("profiles").upsert({ user_id: auth.user.id, ...row });
  // (039 not run yet: save the rest.)
  if (error && /education|smoking|exercise/.test(error.message)) {
    const rest = Object.fromEntries(Object.entries(row).filter(([k]) => !["education", "smoking", "exercise"].includes(k)));
    ({ error } = await client.from("profiles").upsert({ user_id: auth.user.id, ...rest }));
  }
  if (error) return fail(/relation .* does not exist|schema cache/i.test(error.message) ? "Run 038_about_you.sql first." : error.message);
  revalidatePath("/mbm/future");
  revalidatePath("/mbm");
  return { ok: true };
}

// ---------- Your account (040_account.sql) ----------

// A new profile picture: a small JPEG made in the browser (data: URL), or "" to take it off.
export async function saveAvatar(dataUrl: string): Promise<Result> {
  if (dataUrl && (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl) || dataUrl.length > 120000)) return fail("That picture didn't work. Try a smaller one.");
  const client = await mbm();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return fail("Sign in again.");
  const { error } = await client.from("profiles").upsert({ user_id: auth.user.id, avatar: dataUrl || null, updated_at: new Date().toISOString() });
  if (error) return fail(/avatar/.test(error.message) ? "Run 040_account.sql first." : error.message);
  revalidatePath("/mbm", "layout");
  return { ok: true };
}

// A new email: Supabase sends a link to the new address (and, depending on its settings, the
// old one too); it changes once that's clicked.
export async function changeEmail(email: string): Promise<Result & { sent?: boolean }> {
  const e = email.trim().slice(0, 200);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return fail("That doesn't look like an email address.");
  const origin = (await headers()).get("origin") ?? "";
  const { error } = await (await mbm()).auth.updateUser({ email: e }, { emailRedirectTo: origin ? `${origin}/mbm/account` : undefined });
  if (error) return fail(error.message);
  return { ok: true, sent: true };
}

export async function changePassword(password: string): Promise<Result> {
  if (password.length < 8) return fail("Pick a password with at least 8 characters.");
  const { error } = await (await mbm()).auth.updateUser({ password: password.slice(0, 200) });
  if (error) return fail(error.message);
  return { ok: true };
}

// Clear everything you've recorded (the account stays), or delete the account and all of it.
export async function deleteMine(what: "data" | "account", typed: string): Promise<Result> {
  if (typed.trim().toLowerCase() !== "delete") return fail('Type "delete" to confirm.');
  const client = await mbm();
  const { error } = await client.rpc(what === "account" ? "delete_my_account" : "delete_my_data");
  if (error) return fail(/function .* does not exist|schema cache/i.test(error.message) ? "Run 040_account.sql first." : error.message);
  if (what === "account") {
    await client.auth.signOut();
    redirect("/mbm/login");
  }
  revalidatePath("/mbm", "layout");
  return { ok: true };
}

// ---------- The Plan tab (041_plan.sql) ----------
export type PlanInput = {
  id?: string; // (none: new)
  title: string;
  start: string; // ISO
  end: string;
  location: string | null;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
  toGoogle?: boolean; // (new ones: also add it to Google Calendar)
};

// A new plan, or a change to one (yours, or a Google event: changed in Google too).
export async function savePlan(p: PlanInput): Promise<Result & { id?: string }> {
  const { createGoogleEvent, updateGoogleEvent } = await import("@/mbm/google");
  const title = p.title.trim().slice(0, 300) || "Untitled";
  const start = new Date(p.start);
  const end = new Date(p.end);
  if (!(+end > +start)) return fail("The end has to be after the start.");
  if (+end - +start > 3 * 86400_000) return fail("That's longer than three days.");
  const location = p.location?.trim().slice(0, 300) || null;
  const row = { title, starts_at: start.toISOString(), ends_at: end.toISOString(), all_day: false, location, place_id: p.placeId, lat: p.lat, lng: p.lng, updated_at: new Date().toISOString() };
  const times = { title, start: row.starts_at, end: row.ends_at, location };
  const client = await mbm();
  let id = p.id;
  if (!id) {
    if (p.toGoogle) {
      const made = await createGoogleEvent(client, times);
      if ("problem" in made) return fail(made.problem);
      id = made.id;
    } else {
      id = `mbm:${crypto.randomUUID()}`;
    }
    const { error } = await client.from("calendar_events").insert({ id, ...row });
    if (error) return fail(/place_id|lat|lng/.test(error.message) ? "Run 041_plan.sql first." : error.message);
  } else {
    if (!id.startsWith("mbm:")) {
      const problem = await updateGoogleEvent(client, id, times);
      if (problem) return fail(problem);
    }
    const { error } = await client.from("calendar_events").update(row).eq("id", id);
    if (error) return fail(error.message);
  }
  revalidatePath("/mbm/plan");
  return { ok: true, id };
}

export async function deletePlan(id: string): Promise<Result> {
  const { deleteGoogleEvent } = await import("@/mbm/google");
  const client = await mbm();
  if (!id.startsWith("mbm:")) {
    const problem = await deleteGoogleEvent(client, id);
    if (problem) return fail(problem);
  }
  const { error } = await client.from("calendar_events").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/mbm/plan");
  return { ok: true };
}

// ---------- Jobs and categories (043_jobs_and_categories.sql) ----------

// A setting: on, off, or (null) whatever its category says / the default.
export type JobPrefs = {
  stop_on_commute: boolean | null;
  places: string[] | null; // null: its category's
  start_mode: "always" | "calendar" | "never" | null; // arriving at its places (044)
  weekly_goal_min: number | null; // the goal's amount, in minutes
  goal_per?: "day" | "week"; // (049) per day or per week
  hide_from_stats: boolean | null;
};
const NEEDS_043 = "Run the newest SQL files in Supabase first (043 through 049).";
const cleanPrefs = (p: JobPrefs) => ({
  stop_on_commute: typeof p.stop_on_commute === "boolean" ? p.stop_on_commute : null,
  places: Array.isArray(p.places) ? p.places.filter(isUuid).slice(0, 30) : null,
  start_mode: p.start_mode === "always" || p.start_mode === "calendar" || p.start_mode === "never" ? p.start_mode : null,
  weekly_goal_min: typeof p.weekly_goal_min === "number" && p.weekly_goal_min >= 1 ? Math.min(10080, Math.round(p.weekly_goal_min)) : null,
  hide_from_stats: typeof p.hide_from_stats === "boolean" ? p.hide_from_stats : null,
  ...(p.goal_per === "day" || p.goal_per === "week" ? { goal_per: p.goal_per } : {}),
});
const missing043 = (msg: string) => /categor|stop_on_commute|start_mode|auto_start|weekly_goal|goal_per|hide_from_stats|own_color|delete_job|tuck_between/i.test(msg);

export async function saveJob(id: string, input: JobPrefs & { category_id: string | null; color?: string }): Promise<Result> {
  if (!isUuid(id)) return fail("That job is gone.");
  const category_id = input.category_id && isUuid(input.category_id) ? input.category_id : null;
  // (Its color: in a category it's the category's; this is kept as its own for if it leaves.)
  const color = typeof input.color === "string" && /^#[0-9a-f]{6}$/i.test(input.color) ? { color: input.color.toLowerCase() } : {};
  const { error } = await (await mbm()).from("activities").update({ ...cleanPrefs(input), category_id, ...color }).eq("id", id);
  if (error) return fail(missing043(error.message) ? NEEDS_043 : error.message);
  refresh();
  return { ok: true };
}

export async function saveCategory(input: { id?: string; name: string; color: string } & JobPrefs): Promise<Result & { id?: string }> {
  const name = input.name.trim().slice(0, 60);
  if (!name) return fail("Give it a name.");
  if (!/^#[0-9a-f]{6}$/i.test(input.color)) return fail("That isn't a color.");
  const client = await mbm();
  const row = { name, color: input.color.toLowerCase(), ...cleanPrefs(input) };
  const res = input.id && isUuid(input.id) ? await client.from("categories").update(row).eq("id", input.id).select("id").single() : await client.from("categories").insert(row).select("id").single();
  if (res.error) {
    if (res.error.code === "23505") return fail(`You already have a category called ${name}.`);
    return fail(missing043(res.error.message) ? NEEDS_043 : res.error.message);
  }
  refresh();
  return { ok: true, id: (res.data as { id: string }).id };
}

// (Its jobs stay, back to their own colors.)
export async function deleteCategory(id: string): Promise<Result> {
  if (!isUuid(id)) return fail("That category is gone.");
  const client = await mbm();
  await client.from("activities").update({ category_id: null }).eq("category_id", id);
  const { error } = await client.from("categories").delete().eq("id", id);
  if (error) return fail(error.message);
  refresh();
  return { ok: true };
}

// A plan with no place, at its time: start it now, or skip it.
export async function answerPlan(id: string, start: boolean): Promise<Result> {
  if (typeof id !== "string" || id.length > 300) return fail("That plan is gone.");
  const { error } = await (await mbm()).rpc("answer_plan", { p_id: id, p_start: start });
  if (error) return fail(/answer_plan/.test(error.message) ? NEEDS_043 : error.message);
  refresh();
  return { ok: true };
}

// How many entries a job has (for the delete box).
export async function jobEntryCount(id: string): Promise<number> {
  if (!isUuid(id)) return 0;
  const { count } = await (await mbm()).from("blocks").select("id", { count: "exact", head: true }).eq("activity_id", id);
  return count ?? 0;
}

// Delete a job: its entries move to another job, or (moveTo null) go with it.
export async function deleteJob(id: string, moveTo: string | null): Promise<Result> {
  if (!isUuid(id) || (moveTo !== null && !isUuid(moveTo))) return fail("That job is gone.");
  const { error } = await (await mbm()).rpc("delete_job", { p_id: id, p_move_to: moveTo });
  if (error) return fail(missing043(error.message) ? NEEDS_043 : error.message);
  refresh();
  return { ok: true };
}

// Work, Coffee, Work back to back: one Work, with Coffee under it.
export async function tuckBetween(blockId: string): Promise<Result> {
  if (!isUuid(blockId)) return fail("That entry is gone.");
  const { data, error } = await (await mbm()).rpc("tuck_between", { p_block: blockId });
  if (error) return fail(missing043(error.message) ? NEEDS_043 : error.message);
  if (!data) return fail("There isn't the same job before and after it any more.");
  refresh();
  return { ok: true };
}

// ---------- Actual places (047_real_places.sql) ----------

// One of your places, or an actual place from Google (picked in a place search).
export type PlacePick = { kind: "mine"; id: string } | { kind: "real"; googleId: string | null; name: string; address: string | null; lat: number; lng: number };
const NEEDS_047 = "Run 047_real_places.sql in Supabase first.";
const realOf = (p: Extract<PlacePick, { kind: "real" }>) => {
  if (![p.lat, p.lng].every(Number.isFinite) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) return null;
  const name = String(p.name ?? "").trim().slice(0, 200);
  if (!name) return null;
  return { google_id: p.googleId ? String(p.googleId).slice(0, 300) : null, name, address: p.address ? String(p.address).slice(0, 300) : null, lat: p.lat, lng: p.lng };
};

// A stop: your name for it (null: unchanged; "": none, show the actual place's), and what actual
// place it was (null: unchanged).
export async function setStopPlace(visitId: string, own: string | null, pick: PlacePick | null): Promise<Result> {
  if (!isUuid(visitId)) return fail("That stop is gone.");
  const name = own === null ? null : String(own).replace(/\s+/g, " ").trim().slice(0, 80);
  if (pick === null) {
    if (!name) return fail("Give it a name, or pick the actual place.");
    return namePlace(visitId, name);
  }
  const real = pick.kind === "real" ? realOf(pick) : null;
  if (pick.kind === "real" && !real) return fail("That place has no location.");
  if (pick.kind === "mine" && !isUuid(pick.id)) return fail("That place is gone.");
  const client = await mbm();
  await unlockDaysOf(client, visitId);
  const { error } = await client.rpc("set_stop_place", { p_visit: visitId, p_own: name, p_place: pick.kind === "mine" ? pick.id : null, p_real: real });
  if (error) return fail(/set_stop_place|place_for_real/.test(error.message) ? NEEDS_047 : error.message);
  await learnMisread(visitId);
  refresh();
  return { ok: true };
}

// An entry happened at a place found in the search.
export async function setEntryPlacePick(blockId: string, pick: PlacePick): Promise<Result> {
  if (pick.kind === "mine") return setEntryPlace(blockId, pick.id);
  const real = realOf(pick);
  if (!real) return fail("That place has no location.");
  const { data, error } = await (await mbm()).rpc("place_for_real", { p_real: real });
  if (error) return fail(/place_for_real/.test(error.message) ? NEEDS_047 : error.message);
  return setEntryPlace(blockId, data as string);
}

// Your places, for a place search.
export async function myPlaces(): Promise<PlaceLite[]> {
  const client = await mbm();
  let r = await client.from("places").select("id, name, lat, lng, real_name, real_address").order("name").limit(500);
  if (r.error) r = (await client.from("places").select("id, name, lat, lng").order("name").limit(500)) as typeof r;
  return (r.data ?? []) as PlaceLite[];
}

// ---------- The Places page (048_manage_places.sql) ----------

const NEEDS_048 = "Run 047_real_places.sql, then 048_manage_places.sql, in Supabase first.";
const missing048 = (m: string) => /merge_places|delete_place|edit_place|place_for_real|real_name/.test(m);

// Your name for a place (null: unchanged; "": none) and the actual place it is (null: unchanged).
export async function editPlace(id: string, own: string | null, real: Extract<PlacePick, { kind: "real" }> | null): Promise<Result> {
  if (!isUuid(id)) return fail("That place is gone.");
  const r = real ? realOf(real) : null;
  if (real && !r) return fail("That place has no location.");
  const { error } = await (await mbm()).rpc("edit_place", { p_id: id, p_own: own === null ? null : String(own).replace(/\s+/g, " ").trim().slice(0, 80), p_real: r });
  if (error) return fail(missing048(error.message) ? NEEDS_048 : error.message);
  refresh();
  return { ok: true };
}

export async function mergePlaces(from: string, into: string): Promise<Result> {
  if (!isUuid(from) || !isUuid(into)) return fail("That place is gone.");
  const { error } = await (await mbm()).rpc("merge_places", { p_from: from, p_into: into });
  if (error) return fail(missing048(error.message) ? NEEDS_048 : error.message);
  refresh();
  return { ok: true };
}

export async function deletePlace(id: string): Promise<Result> {
  if (!isUuid(id)) return fail("That place is gone.");
  const { error } = await (await mbm()).rpc("delete_place", { p_id: id });
  if (error) return fail(missing048(error.message) ? NEEDS_048 : error.message);
  refresh();
  return { ok: true };
}

// A place picked in a search, as one of yours (an actual place becomes yours): its id.
export async function placeIdFor(pick: PlacePick): Promise<Result & { id?: string }> {
  if (pick.kind === "mine") return isUuid(pick.id) ? { ok: true, id: pick.id } : fail("That place is gone.");
  const real = realOf(pick);
  if (!real) return fail("That place has no location.");
  const { data, error } = await (await mbm()).rpc("place_for_real", { p_real: real });
  if (error) return fail(/place_for_real/.test(error.message) ? NEEDS_047 : error.message);
  return { ok: true, id: data as string };
}

// An unnamed stop's building, found by your browser (or null: none there). Saved, so it's looked
// up once; if it's one of your places' buildings, the stop becomes that place (046).
export async function setStopOutline(visitId: string, outline: [number, number][] | null): Promise<Result> {
  if (!isUuid(visitId)) return fail("Bad stop.");
  const clean = outline && outline.length >= 3 && outline.length <= 2000 ? outline.map(([a, b]) => [Math.round(a * 1e7) / 1e7, Math.round(b * 1e7) / 1e7]) : null;
  const { error } = await (await mbm()).rpc("set_stop_outline", { p_visit_id: visitId, p_outline: clean });
  if (error) return fail(error.message);
  return { ok: true };
}

// Show or hide Google Calendar's events on Plan and the Day bar (049).
export async function setCalendarHidden(hide: boolean): Promise<Result> {
  const client = await mbm();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return fail("Sign in first.");
  const { error } = await client.from("profiles").upsert({ user_id: auth.user.id, hide_calendar: !!hide });
  if (error) return fail(/hide_calendar/.test(error.message) ? "Run 049_hide_calendar_daily_goals.sql in Supabase first." : error.message);
  revalidatePath("/mbm/plan");
  revalidatePath("/mbm/day");
  return { ok: true };
}

// Places that look alike but aren't the same: off the Look alike list (051).
export async function keepApart(ids: string[]): Promise<Result> {
  if (!Array.isArray(ids) || ids.length < 2 || !ids.every(isUuid)) return fail("Those places are gone.");
  const client = await mbm();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return fail("Sign in first.");
  const key = [...ids].sort().join("+");
  const { data, error: readError } = await client.from("profiles").select("kept_apart").maybeSingle();
  if (readError) return fail(/kept_apart/.test(readError.message) ? "Run 051_arrive_when_there.sql in Supabase first." : readError.message);
  const kept = ((data as { kept_apart?: string[] } | null)?.kept_apart ?? []).filter((k) => k !== key);
  const { error } = await client.from("profiles").upsert({ user_id: auth.user.id, kept_apart: [...kept, key].slice(-500) });
  if (error) return fail(error.message);
  revalidatePath("/mbm/account/places");
  return { ok: true };
}

// An entry under a job comes back up; the job is cut around it (052).
export async function liftOut(blockId: string): Promise<Result> {
  if (!isUuid(blockId)) return fail("That entry is gone.");
  const { data, error } = await (await mbm()).rpc("lift_out", { p_block: blockId });
  if (error) return fail(/lift_out/.test(error.message) ? "Run 052_tuck_across.sql in Supabase first." : error.message);
  if (!data) return fail("It isn't under anything any more.");
  refresh();
  return { ok: true };
}
