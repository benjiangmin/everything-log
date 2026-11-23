import { createClient } from "@supabase/supabase-js";
import { syncCalendar } from "@/mbm/google";

// For the phone, in the background (after it sends your location, at most every 10 minutes):
// brings Google Calendar up to date (itself at most every 10 minutes), then starts anything due,
// e.g. a job set to "only if it's on my calendar" when you've arrived at its place. Without it,
// plans only reached the server when you opened the website or the app.
//   POST /mbm/api/tick  Authorization: Bearer <the phone's Supabase access token>
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Sign in first." }, { status: 401 });
  const client = createClient(process.env.MBM_SUPABASE_URL!, process.env.MBM_SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: user } = await client.auth.getUser(token);
  if (!user.user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const calendar = await syncCalendar(client).catch(() => ({ ok: false }));
  const started = await client.rpc("start_for_you");
  return Response.json({ calendar: calendar.ok, started: !started.error });
}
