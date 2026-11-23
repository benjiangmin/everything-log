import "server-only";

// NOT USED YET: the AI suggestions are on hold (wired back in later: api/context/route.ts and
// bestGuesses in actions.ts call sharpen(); needs OPENAI_API_KEY and 065_job_traits.sql).
import type { SupabaseClient } from "@supabase/supabase-js";
import { ask } from "./ai";

// Suggestions that understand what a job is (065_job_traits.sql). The database's suggest() ranks
// jobs by when they usually happen, where, and your calendar; this then:
//   - leaves out one-offs ("Ate lunch with Josh and Allen"), jobs out of season ("Thanksgiving
//     banquet" in March), and jobs tied to a place you're not at ("Eating at Abby's house");
//   - puts first the job that fits where you are ("Grabbing Chipotle" at Chipotle), even if
//     you've never done it at this exact spot.
// What a job is, and which job fits a place, are each worked out once by the AI and kept.

export type Guess = { activity_id: string; name: string; color: string; confidence: number; why: string[] };
export type Traits = { kind: "routine" | "occasional" | "one_off"; months: number[] | null; place: string | null; people: boolean; about: string };
type Job = { id: string; name: string; color: string; traits: Traits | null; traits_name: string | null; created_at: string };

const TRAITS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["jobs"],
  properties: {
    jobs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kind", "months", "place", "people", "about"],
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ["routine", "occasional", "one_off"] },
          months: { anyOf: [{ type: "array", items: { type: "integer" } }, { type: "null" }] },
          place: { anyOf: [{ type: "string" }, { type: "null" }] },
          people: { type: "boolean" },
          about: { type: "string" },
        },
      },
    },
  },
};

// Reads the jobs that haven't been read yet (or were renamed since), in one go, and keeps it.
export async function readJobs(client: SupabaseClient, jobs: Job[]): Promise<void> {
  const todo = jobs.filter((j) => !j.traits || j.traits_name !== j.name).slice(0, 60);
  if (!todo.length) return;
  const out = await ask<{ jobs: (Traits & { id: string })[] }>(
    `You label entries in a personal time tracker. For each entry name, say:
- kind: "routine" (done regularly: Sleep, Gym, Class, Commute, Cooking, Working on this project), "occasional" (now and then: Haircut, Grabbing Chipotle, Movie night), or "one_off" (a specific one-time thing, usually with named people or a specific event: "Ate lunch with Josh and Allen", "Sam's birthday party", "Flight to Seoul").
- months: the months (1-12) it only happens in, if it's tied to a season or holiday ("Thanksgiving banquet": [11]; "Christmas shopping": [11, 12]); otherwise null.
- place: the specific place it only makes sense at, if its name says one ("Eating at Abby's house": "Abby's house"; "Grabbing Chipotle": "Chipotle"); otherwise null. Not general kinds of places (gym, class, work).
- people: true if it names specific people.
- about: a few plain words on what it is.`,
    JSON.stringify(todo.map((j) => ({ id: j.id, name: j.name }))),
    "job_traits",
    TRAITS_SCHEMA,
  );
  if (!out) return;
  const byId = new Map(todo.map((j) => [j.id, j]));
  await Promise.all(
    out.jobs
      .filter((t) => byId.has(t.id))
      .map((t) => {
        const { id, ...traits } = t;
        return client.from("activities").update({ traits, traits_name: byId.get(id)!.name }).eq("id", id);
      }),
  );
}

// Where you are, by name: your name for the place you're at, else what the phone found, else the
// shop or restaurant OpenStreetMap has right there.
export async function hereName(client: SupabaseClient, lat: number | null, lng: number | null): Promise<string | null> {
  const { data } = await client
    .from("visits")
    .select("auto_name, places(name)")
    .is("departed_at", null)
    .order("arrived_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const v = data as { auto_name: string | null; places: { name: string } | { name: string }[] | null } | null;
  const place = Array.isArray(v?.places) ? v?.places[0]?.name : v?.places?.name;
  if (place || v?.auto_name) return place ?? v!.auto_name;
  if (lat == null || lng == null) return null;
  return nearbyBusiness(lat, lng);
}

// The named shop / restaurant / café … right where you are (OpenStreetMap; kept a week).
async function nearbyBusiness(lat: number, lng: number): Promise<string | null> {
  const at = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const q = `[out:json][timeout:6];nwr(around:35,${at})[name][~"^(amenity|shop|leisure|tourism)$"~"."];out center 8;`;
  try {
    const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`, { next: { revalidate: 7 * 86400 }, signal: AbortSignal.timeout(7000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { elements?: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: { name?: string } }[] };
    const [la, lo] = at.split(",").map(Number);
    const near = (body.elements ?? [])
      .map((e) => ({ name: e.tags?.name, p: e.center ?? (e.lat != null && e.lon != null ? { lat: e.lat, lon: e.lon } : null) }))
      .filter((e): e is { name: string; p: { lat: number; lon: number } } => !!e.name && !!e.p)
      .sort((a, b) => Math.hypot(a.p.lat - la, a.p.lon - lo) - Math.hypot(b.p.lat - la, b.p.lon - lo));
    return near[0]?.name ?? null;
  } catch {
    return null;
  }
}

// Which of your jobs fits a place, by its name (or none). Kept; asked again only when you've made
// new jobs since.
async function jobForPlace(client: SupabaseClient, label: string, jobs: Job[]): Promise<string | null> {
  const { data } = await client.from("place_job_matches").select("activity_id, made_at").eq("label", label).maybeSingle();
  const newest = Math.max(0, ...jobs.map((j) => +new Date(j.created_at)));
  if (data && +new Date(data.made_at) >= newest) return data.activity_id;
  const out = await ask<{ id: string | null }>(
    `Someone just arrived at a place. From their list of tracked activities, pick the one they're most likely doing there, only if one clearly fits the place (a restaurant → eating there or grabbing food from it; a gym → working out; a church → church). If none clearly fits, answer null.`,
    JSON.stringify({ place: label, activities: jobs.map((j) => ({ id: j.id, name: j.name, about: j.traits?.about ?? null })) }),
    "place_job",
    { type: "object", additionalProperties: false, required: ["id"], properties: { id: { anyOf: [{ type: "string" }, { type: "null" }] } } },
  );
  if (!out) return data?.activity_id ?? null;
  const id = out.id && jobs.some((j) => j.id === out.id) ? out.id : null;
  await client.from("place_job_matches").upsert({ label, activity_id: id, made_at: new Date().toISOString() });
  return id;
}

const lower = (s: string) => s.toLowerCase().replace(/[’']/g, "'");

// The best guesses, sharpened. raw: suggest()'s list (asked for more than you need). here: where
// you are now (null for a time ahead, like a calendar event). Returns the best `limit`.
export async function sharpen(
  client: SupabaseClient,
  raw: Guess[],
  opts: { at: Date; tz: string; here: string | null; limit: number; later?: (fn: () => Promise<void>) => void },
): Promise<Guess[]> {
  const { data } = await client.from("activities").select("id, name, color, traits, traits_name, created_at");
  const jobs = (data ?? []) as Job[];
  if (!jobs.length) return raw.slice(0, opts.limit);
  // (New or renamed jobs: read after answering, so this answer isn't held up.)
  if (jobs.some((j) => !j.traits || j.traits_name !== j.name)) {
    const read = () => readJobs(client, jobs);
    if (opts.later) opts.later(read);
    else await read();
  }
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const month = Number(new Intl.DateTimeFormat("en-US", { month: "numeric", timeZone: opts.tz }).format(opts.at));
  const here = opts.here ? lower(opts.here) : null;
  const atPlace = (p: string) => !!here && (here.includes(lower(p)) || lower(p).includes(here));

  const fits = (g: Guess) => {
    const t = byId.get(g.activity_id)?.traits;
    if (!t) return true;
    if (t.kind === "one_off") return false;
    if (t.months?.length && !t.months.includes(month)) return false;
    if (t.place && !atPlace(t.place)) return false;
    return true;
  };
  let out = raw.filter(fits);

  // The job that fits where you are, first.
  if (opts.here) {
    const id = await jobForPlace(client, opts.here, jobs).catch(() => null);
    const job = id ? byId.get(id) : null;
    // (Still has to make sense: not a one-off, in season, and its own place is this one.)
    if (job && fits({ activity_id: job.id, name: job.name, color: job.color, confidence: 0, why: [] })) {
      const had = out.find((g) => g.activity_id === job.id);
      const g: Guess = had
        ? { ...had, confidence: Math.max(had.confidence, 0.6), why: [`You're at ${opts.here}`, ...had.why.filter((w) => !w.startsWith("You're at"))] }
        : { activity_id: job.id, name: job.name, color: job.color, confidence: 0.6, why: [`You're at ${opts.here}`] };
      out = [g, ...out.filter((x) => x.activity_id !== job.id)];
    }
  }
  return out.slice(0, opts.limit);
}
