"use server";

import { googleStatus, syncCalendar } from "@/mbm/google";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mbm, mbmReady } from "@/mbm/supabase";
import { getDay, getNowInfo, mbmTz, type Day, type NowInfo } from "@/mbm/data";
import { PALETTE } from "@/mbm/colors";

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

export type PlaceLite = { id: string; name: string; lat: number; lng: number };
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
    client.from("places").select("id, name, lat, lng").order("name"),
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
  refresh();
  return { ok: true };
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

// Move a stop to where it really was. If it's one of your named places, the place moves too (and
// every stop there), so it's right everywhere.
export async function moveStop(visitId: string, lat: number, lng: number): Promise<Result> {
  if (!isUuid(visitId)) return fail("That stop is gone.");
  if (![lat, lng].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return fail("Click a spot on the map.");
  const client = await mbm();
  const { data: v, error } = await client.from("visits").select("id, place_id").eq("id", visitId).maybeSingle();
  if (error) return fail(error.message);
  if (!v) return fail("That stop is gone.");
  const placeId = (v as { place_id: string | null }).place_id;
  const moved = placeId
    ? await Promise.all([
        client.from("places").update({ lat, lng }).eq("id", placeId),
        client.from("visits").update({ lat, lng }).eq("place_id", placeId),
      ]).then((rs) => rs.find((r) => r.error)?.error ?? null)
    : (await client.from("visits").update({ lat, lng }).eq("id", visitId)).error;
  if (moved) return fail(moved.message);
  // So the phone's next update doesn't move it back (016_locokit.sql; fine if that's not run yet).
  await client.from("visits").update({ pinned: true }).eq("id", visitId);
  // Moved: its building is looked up again at the new spot (021_buildings.sql; fine if not run).
  if (placeId) {
    await client.from("places").update({ outline: null }).eq("id", placeId);
    await client.from("visits").update({ outline: null, outline_checked: false }).eq("place_id", placeId);
  } else {
    await client.from("visits").update({ outline: null, outline_checked: false }).eq("id", visitId);
  }
  refresh();
  return { ok: true };
}

// Remove a stop the phone made up (the trips around it join up).
export async function removeStop(visitId: string): Promise<Result> {
  if (!isUuid(visitId)) return fail("That stop is gone.");
  const client = await mbm();
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
}): Promise<Result> {
  if (!Number.isFinite(r.start) || !Number.isFinite(r.end) || r.end < r.start) return fail("That trip doesn't work.");
  const round = (v: number) => Math.round(v * 1e6) / 1e6;
  const { error } = await (await mbm()).from("route_reports").insert({
    trip_start: new Date(r.start).toISOString(),
    trip_end: new Date(r.end).toISOString(),
    from_visit: r.fromId && isUuid(r.fromId) ? r.fromId : null,
    to_visit: r.toId && isUuid(r.toId) ? r.toId : null,
    note: r.note.trim().slice(0, 2000) || null,
    drawn: r.drawn.slice(0, 50).map((line) => line.slice(0, 5000).map((p) => [round(p.lat), round(p.lng)])),
    dots: r.dots.slice(0, 10000),
    legs: r.legs.slice(0, 200),
    version: r.version.slice(0, 40),
  });
  if (error) return fail(/route_reports/.test(error.message) ? "Run supabase/minute-by-minute/029_route_reports.sql first." : error.message);
  return { ok: true };
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
