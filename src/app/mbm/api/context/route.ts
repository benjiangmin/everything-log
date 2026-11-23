import { createClient } from "@supabase/supabase-js";
import { syncCalendar } from "@/mbm/google";

// For the phone: best guesses for right now (and whether something's probably over), plus your
// calendar's next events (so it can remind you as each one starts). Brings the calendar up to
// date first (at most every 10 minutes). Signed in with the phone's own Supabase session:
//   POST /mbm/api/context  Authorization: Bearer <access token>
//   { "lat": 43.07, "lng": -89.40, "tz": "America/Chicago" }   (lat/lng optional)
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Sign in first." }, { status: 401 });
  const client = createClient(process.env.MBM_SUPABASE_URL!, process.env.MBM_SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: user } = await client.auth.getUser(token);
  if (!user.user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { lat?: number; lng?: number; tz?: string };
  const tz = typeof body.tz === "string" && /^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/.test(body.tz) ? body.tz : "America/Chicago";
  const lat = Number.isFinite(body.lat) ? body.lat : null;
  const lng = Number.isFinite(body.lng) ? body.lng : null;

  const calendar = await syncCalendar(client).catch(() => ({ ok: false }));
  const now = new Date();
  const [guess, over, upcoming] = await Promise.all([
    client.rpc("suggest", { p_at: now.toISOString(), p_lat: lat, p_lng: lng, p_tz: tz, p_limit: 2 }),
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
  return Response.json({ suggestions: guess.data ?? [], over: over.data ?? [], events, calendar: calendar.ok });
}
