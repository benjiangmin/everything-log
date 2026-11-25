import { phoneClient } from "@/mbm/phoneAuth";
import { syncCalendar } from "@/mbm/google";
import { neverSuggest, pinnedJobs, rightNow, smartGuesses, smartOver, type Guess, type Over } from "@/mbm/smart";

// For the phone: best guesses for right now (and whether something's probably over), plus your
// calendar's next events (so it can remind you as each one starts). Brings the calendar up to
// date first (at most every 10 minutes). Signed in with the phone's own Supabase session:
//   POST /mbm/api/context  Authorization: Bearer <access token>
//   { "lat": 43.07, "lng": -89.40, "tz": "America/Chicago" }   (lat/lng optional)
export async function POST(req: Request) {
  const auth = await phoneClient(req);
  if (auth.error) return auth.error;
  const { client } = auth;
  const body = auth.body as { lat?: number; lng?: number; tz?: string };
  const tz = typeof body.tz === "string" && /^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/.test(body.tz) ? body.tz : "America/Chicago";
  const lat = Number.isFinite(body.lat) ? body.lat : null;
  const lng = Number.isFinite(body.lng) ? body.lng : null;

  const calendar = await syncCalendar(client).catch(() => ({ ok: false }));
  // Anything due starts first (a job set to start when you arrive at its place), so opening the
  // app shows it running instead of waiting for the phone's next background send.
  await client.rpc("start_for_you");
  const now = new Date();
  const [guess, over, upcoming] = await Promise.all([
    client.rpc("suggest", { p_at: now.toISOString(), p_lat: lat, p_lng: lng, p_tz: tz, p_limit: 6 }),
    client.rpc("probably_over", { p_at: now.toISOString(), p_tz: tz }),
    client
      .from("calendar_events")
      .select("id, title, starts_at, ends_at")
      .eq("all_day", false)
      .gte("starts_at", now.toISOString())
      .lt("starts_at", new Date(now.getTime() + 18 * 3600_000).toISOString())
      .order("starts_at")
      .limit(30),
  ]);
  if (guess.error) return Response.json({ error: /suggest/.test(guess.error.message) ? "Run 030_suggestions.sql first." : guess.error.message }, { status: 500 });

  // For each upcoming event, what you'd likely start then (by its name / what you did before).
  const events = await Promise.all(
    (upcoming.data ?? []).map(async (e: { id: string; title: string; starts_at: string; ends_at: string }) => {
      const g = await client.rpc("suggest", { p_at: e.starts_at, p_lat: null, p_lng: null, p_tz: tz, p_limit: 2 });
      return { ...e, suggestions: g.data ?? [] };
    }),
  );
  // With AI suggestions on: only the guesses that make sense, and only the long-running jobs worth
  // a word (each with the AI's own "message" and "action": "stop" or "break"). Off: as before.
  const opts = { at: now, tz, lat, lng };
  // (recommended: Home's "Right now?", the same 3 as the website's. pins: your pinned jobs, 084.)
  const [suggestions, nudges, recommended, pins, never] = await Promise.all([
    smartGuesses(client, (guess.data ?? []) as Guess[], { ...opts, limit: 2 }).catch(() => ((guess.data ?? []) as Guess[]).slice(0, 2)),
    smartOver(client, (over.data ?? []) as Over[], opts).catch(() => []),
    rightNow(client, { ...opts, guesses: (guess.data ?? []) as Guess[] }).catch(() => []),
    pinnedJobs(client),
    neverSuggest(client),
  ]);
  // Untracked a while (083): nothing running, and your last entry ended at least your chosen
  // minutes ago. The phone asks what you're doing (once per stretch: keyed by "since").
  let untracked: { since: string; minutes: number } | null = null;
  const prof = await client.from("profiles").select("untracked_after_min").maybeSingle();
  const after = (prof.data as { untracked_after_min?: number | null } | null)?.untracked_after_min;
  if (after) {
    const [run, last] = await Promise.all([
      client.from("blocks").select("id").is("ended_at", null).limit(1),
      client.from("blocks").select("ended_at").not("ended_at", "is", null).lte("ended_at", now.toISOString()).order("ended_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const since = (last.data as { ended_at?: string } | null)?.ended_at;
    if (!run.data?.length && since) {
      const minutes = Math.floor((+now - +new Date(since)) / 60_000);
      if (minutes >= after) untracked = { since, minutes };
    }
  }
  return Response.json({ suggestions, over: nudges, events, calendar: calendar.ok, untracked, recommended, pins, never });
}
