import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiReady, ask } from "./ai";
import { dayKeyOf, dayRange } from "./time";
import { isMoving } from "./moving";

// AI suggestions (081_ai_suggestions.sql), for people who turned them on (Settings → Notifications).
// The database's suggest() finds likely jobs from history, time of day, where you are and your
// calendar; the AI then looks at the whole situation and keeps only the ones that make sense
// ("Grabbing Naf Naf" when you're nowhere near Naf Naf: out). A job running long (probably_over)
// is only brought up when the AI thinks it's worth saying something, in its words.
// It's asked again only when something changed (where you are, what's running, your calendar, the
// hour); otherwise its last answer is used.

export type Guess = { activity_id: string; name: string; color: string; confidence: number; why: string[] };
export type Over = { block_id: string; activity_id: string; name: string; running_min: number; usual_min: number; next?: Guess[] };
export type Nudge = Over & { message: string | null; action: "stop" | "break" | null };

type Opts = { at: Date; tz: string; lat?: number | null; lng?: number | null };
type Place = { id: string; name: string; lat: number; lng: number };
// (A joined row: Supabase gives one, or a list of one.)
type Rel<T> = T | T[] | null;
const one = <T,>(r: Rel<T>): T | null => (Array.isArray(r) ? (r[0] ?? null) : r);

// Is it on for this person (and is there a key)?
export async function aiOn(client: SupabaseClient): Promise<boolean> {
  if (!aiReady()) return false;
  const { data, error } = await client.from("profiles").select("ai_suggestions").maybeSingle();
  return !error && !!(data as { ai_suggestions?: boolean } | null)?.ai_suggestions;
}

const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180;
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.round(Math.hypot(x, y) * 6371 * 10) / 10;
};
const hm = (d: Date | string, tz: string) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(d));
const weekday = (d: Date | string, tz: string) => new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(new Date(d));
const minuteOfDay = (d: Date | string, tz: string) => {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(d)).split(":").map(Number);
  return h * 60 + m;
};
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const clockOf = (m: number) => `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, "0")} ${m >= 720 ? "PM" : "AM"}`;

// Everything about right now, in plain terms, for the AI.
async function situation(client: SupabaseClient, { at, tz, lat, lng }: Opts) {
  const { start } = dayRange(dayKeyOf(at, tz), tz);
  const [visit, placesRes, running, today, events] = await Promise.all([
    client.from("visits").select("lat, lng, auto_name, place_id, places(name)").is("departed_at", null).order("arrived_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("places").select("id, name, lat, lng").limit(500),
    client.from("blocks").select("id, started_at, activities(name)").is("ended_at", null).lte("started_at", at.toISOString()),
    client.from("blocks").select("started_at, ended_at, activities(name)").gte("started_at", start.toISOString()).lte("started_at", at.toISOString()).order("started_at").limit(30),
    client
      .from("calendar_events")
      .select("id, title, starts_at, ends_at, location")
      .eq("all_day", false)
      .lt("starts_at", new Date(+at + 3 * 3600_000).toISOString())
      .gt("ends_at", new Date(+at - 3600_000).toISOString())
      .order("starts_at")
      .limit(12),
  ]);
  const v = visit.data as unknown as { lat: number; lng: number; auto_name: string | null; place_id: string | null; places: Rel<{ name: string }> } | null;
  const vPlace = v ? one(v.places)?.name : null;
  let spot = lat != null && lng != null ? { lat, lng } : v ? { lat: v.lat, lng: v.lng } : null;
  if (!spot) {
    const { data } = await client.from("points").select("lat, lng").lte("at", at.toISOString()).gt("at", new Date(+at - 20 * 60_000).toISOString()).order("at", { ascending: false }).limit(1).maybeSingle();
    if (data) spot = data as { lat: number; lng: number };
  }
  const places = (placesRes.data ?? []) as Place[];
  const name = (r: { activities: Rel<{ name: string }> }) => one(r.activities)?.name ?? "Something";
  return {
    spot,
    places,
    placeId: v?.place_id ?? null,
    runningIds: ((running.data ?? []) as { id: string }[]).map((r) => r.id),
    eventIds: ((events.data ?? []) as { id: string }[]).map((e) => e.id),
    facts: {
      now: `${weekday(at, tz)} ${new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(at)}, ${hm(at, tz)}`,
      where: spot
        ? {
            at_stop: vPlace ?? v?.auto_name ?? null,
            nearest_named_places: places
              .map((p) => ({ name: p.name, km: km(spot!, p) }))
              .sort((a, b) => a.km - b.km)
              .slice(0, 6),
          }
        : "unknown",
      running: ((running.data ?? []) as unknown as { started_at: string; activities: Rel<{ name: string }> }[]).map((r) => ({
        job: name(r),
        minutes: Math.round((+at - +new Date(r.started_at)) / 60_000),
      })),
      today_so_far: ((today.data ?? []) as unknown as { started_at: string; ended_at: string | null; activities: Rel<{ name: string }> }[]).map((b) => ({
        job: name(b),
        from: hm(b.started_at, tz),
        to: b.ended_at ? hm(b.ended_at, tz) : "now",
      })),
      calendar: ((events.data ?? []) as { title: string; starts_at: string; ends_at: string; location: string | null }[]).map((e) => ({
        title: e.title,
        from: hm(e.starts_at, tz),
        to: hm(e.ends_at, tz),
        ...(e.location ? { location: e.location } : {}),
      })),
    },
  };
}

// What a job usually looks like (last 60 days), and where it happens.
async function jobFacts(client: SupabaseClient, ids: string[], places: Place[], spot: { lat: number; lng: number } | null, at: Date, tz: string) {
  if (!ids.length) return new Map<string, object>();
  const [jobs, hist] = await Promise.all([
    client.from("activities").select("id, name, places, categories(places)").in("id", ids),
    client
      .from("blocks")
      .select("activity_id, started_at, ended_at")
      .in("activity_id", ids)
      .gt("started_at", new Date(+at - 60 * 86400_000).toISOString())
      .lt("started_at", at.toISOString())
      .not("ended_at", "is", null)
      .limit(2000),
  ]);
  const byPlace = new Map(places.map((p) => [p.id, p]));
  const out = new Map<string, object>();
  for (const j of (jobs.data ?? []) as unknown as { id: string; name: string; places: string[] | null; categories: Rel<{ places: string[] | null }> }[]) {
    const own = (j.places?.length ? j.places : one(j.categories)?.places) ?? [];
    const rows = ((hist.data ?? []) as { activity_id: string; started_at: string; ended_at: string }[]).filter((b) => b.activity_id === j.id);
    const days = new Map<string, number>();
    for (const b of rows) days.set(weekday(b.started_at, tz), (days.get(weekday(b.started_at, tz)) ?? 0) + 1);
    const startM = median(rows.map((b) => minuteOfDay(b.started_at, tz)));
    const lenM = median(rows.map((b) => (+new Date(b.ended_at) - +new Date(b.started_at)) / 60_000));
    const last = rows.map((b) => b.started_at).sort().at(-1);
    out.set(j.id, {
      name: j.name,
      happens_at: own
        .map((id) => byPlace.get(id))
        .filter((p): p is Place => !!p)
        .map((p) => ({ place: p.name, km_away: spot ? km(spot, p) : null })),
      last_60_days: {
        times: rows.length,
        days: Object.fromEntries(days),
        usual_start: startM == null ? null : clockOf(Math.round(startM)),
        usual_minutes: lenM == null ? null : Math.round(lenM),
        last_done: last ? `${weekday(last, tz)} ${dayKeyOf(new Date(last), tz)}` : null,
      },
    });
  }
  return out;
}

const hash = (x: unknown) => createHash("sha1").update(JSON.stringify(x)).digest("hex").slice(0, 16);

async function readState<T>(client: SupabaseClient, kind: string): Promise<T | null> {
  const { data } = await client.from("ai_state").select("state").eq("kind", kind).maybeSingle();
  return ((data as { state?: T } | null)?.state ?? null) as T | null;
}
const writeState = (client: SupabaseClient, kind: string, state: object) => client.from("ai_state").upsert({ kind, state, at: new Date().toISOString() }).then(() => null, () => null);

const SUGGEST_RULES = `You check suggestions in a personal time tracker before they're shown. The app guessed which of the person's jobs (activities) they might be starting right now, from their history, time of day, location and calendar. Keep only the ones that clearly make sense right now, best first. A wrong suggestion is worse than none: leave out anything doubtful, and it's fine to keep none.
Check each one:
- Its name. If it names a specific place (a restaurant, a store, someone's house), they must be at or right next to that place now: compare with where they are and their named places. If it names specific people or a one-time event, keep it only if something now points to it (like a calendar event). If it's tied to a season or holiday, it has to be that time of year.
- Where they are. Compare with where the job happens (happens_at and km_away). If they're far from all of those, or clearly out of town, leave it out. A calendar event only counts if they could plausibly get there in time.
- When. The day and time should fit when they usually do it.
Answer with the ids to keep, in order.`;

// The best guesses, checked by the AI (when it's on). raw: suggest()'s list; returns at most `limit`.
export async function smartGuesses(client: SupabaseClient, raw: Guess[], opts: Opts & { limit: number }): Promise<Guess[]> {
  if (!raw.length || !(await aiOn(client))) return raw.slice(0, opts.limit);
  const s = await situation(client, opts);
  const ids = raw.map((g) => g.activity_id);
  const key = hash({
    ids: [...ids].sort(),
    here: s.placeId ?? (s.spot ? [s.spot.lat.toFixed(3), s.spot.lng.toFixed(3)] : null),
    running: s.runningIds,
    events: s.eventIds,
    hour: `${dayKeyOf(opts.at, opts.tz)} ${Math.floor(minuteOfDay(opts.at, opts.tz) / 60)}`,
  });
  const was = await readState<{ key: string; keep: string[] }>(client, "suggest");
  let keep = was?.key === key ? was.keep : null;
  if (!keep) {
    const facts = await jobFacts(client, ids, s.places, s.spot, opts.at, opts.tz);
    const out = await ask<{ keep: string[] }>(
      client,
      "suggest",
      SUGGEST_RULES + ` Keep at most ${opts.limit}.`,
      JSON.stringify({ ...s.facts, suggestions: raw.map((g) => ({ id: g.activity_id, ...(facts.get(g.activity_id) ?? { name: g.name }), why_the_app_guessed_it: g.why })) }),
      { type: "object", additionalProperties: false, required: ["keep"], properties: { keep: { type: "array", items: { type: "string" } } } },
    );
    if (!out) return raw.slice(0, opts.limit); // (the AI didn't answer: as before)
    keep = out.keep.filter((id) => ids.includes(id));
    await writeState(client, "suggest", { key, keep });
  }
  const byId = new Map(raw.map((g) => [g.activity_id, g]));
  return keep
    .map((id) => byId.get(id))
    .filter((g): g is Guess => !!g)
    .slice(0, opts.limit);
}

type OverState = { next_check: string; nudge: { message: string; action: "stop" | "break" } | null; kept_going: number };

const OVER_RULES = `A job in a personal time tracker has been running longer than it usually does. Decide whether to say something to the person right now.
Only speak up when it helps: they probably forgot to stop it (for example they've left the place where it happens, another job or calendar event has started, or it's far past anything normal), or a break would do them good after a long stretch of something tiring. Plenty of things are fine to run long: studying, work, a hangout, a movie, sleeping in. Running twice as long as usual isn't a problem by itself.
If they already said "keep going" (kept_going), be slower to speak up again.
If you speak up, write one short, friendly line in plain words (under 70 characters, no emoji), like "You've been at the gym a while. Done?", and pick action "stop" (it's probably over) or "break" (still going, but a break would help).
Either way, say how many minutes from now to look again (15 to 240).`;

// Jobs running long: which ones are worth a word, and what to say (when the AI is on; otherwise
// all of them, as before, with no words of its own).
export async function smartOver(client: SupabaseClient, all: Over[], opts: Opts): Promise<Nudge[]> {
  // (Never about a Commute: being on the way takes as long as it takes.)
  const over = all.filter((o) => !isMoving(o.name));
  if (!over.length || !(await aiOn(client))) return over.map((o) => ({ ...o, message: null, action: null }));
  // (Old ones, for jobs long since stopped.)
  await client.from("ai_state").delete().like("kind", "over:%").lt("at", new Date(Date.now() - 3 * 86400_000).toISOString()).then(() => null, () => null);
  let s: Awaited<ReturnType<typeof situation>> | null = null;
  const out: Nudge[] = [];
  for (const o of over) {
    const kind = `over:${o.block_id}`;
    let st = await readState<OverState>(client, kind);
    if (!st || +new Date(st.next_check) <= +opts.at) {
      s ??= await situation(client, opts);
      const facts = await jobFacts(client, [o.activity_id], s.places, s.spot, opts.at, opts.tz);
      const ans = await ask<{ speak_up: boolean; message: string; action: "stop" | "break"; check_again_min: number }>(
        client,
        "over",
        OVER_RULES,
        JSON.stringify({ ...s.facts, job: { ...(facts.get(o.activity_id) ?? { name: o.name }), running_minutes: o.running_min, kept_going: st?.kept_going ?? 0 } }),
        {
          type: "object",
          additionalProperties: false,
          required: ["speak_up", "message", "action", "check_again_min"],
          properties: { speak_up: { type: "boolean" }, message: { type: "string" }, action: { type: "string", enum: ["stop", "break"] }, check_again_min: { type: "integer" } },
        },
      );
      if (!ans) continue; // (no answer: say nothing this time)
      st = {
        next_check: new Date(+opts.at + Math.min(240, Math.max(15, ans.check_again_min)) * 60_000).toISOString(),
        nudge: ans.speak_up && ans.message.trim() ? { message: ans.message.trim().slice(0, 90), action: ans.action } : null,
        kept_going: st?.kept_going ?? 0,
      };
      await writeState(client, kind, st);
    }
    if (st.nudge) out.push({ ...o, message: st.nudge.message, action: st.nudge.action });
  }
  return out;
}

// "Keep going": quiet about it for a while (the AI may still speak up later, more slowly).
export async function keepGoing(client: SupabaseClient, blockId: string) {
  const kind = `over:${blockId}`;
  const st = await readState<OverState>(client, kind);
  await writeState(client, kind, { next_check: new Date(Date.now() + 90 * 60_000).toISOString(), nudge: null, kept_going: (st?.kept_going ?? 0) + 1 });
}
