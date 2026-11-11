import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Google Calendar, for Minute by Minute's best guesses (030_suggestions.sql). Each person signs in
// with Google once ("Connect Google Calendar"); their events (all the calendars they have
// switched on in Google Calendar) are copied in, a week back to two days ahead, at most every
// 10 minutes, whenever the website or the phone asks for guesses.
//
// Environment variables (server only; from Google Cloud → APIs & Services → Credentials → an
// OAuth client ID of type "Web application"):
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
// with the authorized redirect URI  https://<your site>/mbm/google/callback

export const googleReady = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.readonly"];
export const redirectUri = (origin: string) => `${origin}/mbm/google/callback`;

export function consentUrl(origin: string, state: string) {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline", // (a refresh token, so it keeps working)
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

type TokenAnswer = { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; error?: string; error_description?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenAnswer> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...body }),
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  return (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as TokenAnswer;
}

// After "Allow": swaps the code for tokens and saves them (yours only: row level security).
export async function finishConnect(client: SupabaseClient, origin: string, code: string): Promise<string | null> {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri(origin) });
  if (!t.access_token) return t.error_description ?? t.error ?? "Google didn't say yes.";
  let email: string | null = null;
  try {
    email = (JSON.parse(Buffer.from((t.id_token ?? "").split(".")[1] ?? "", "base64url").toString()) as { email?: string }).email ?? null;
  } catch {}
  const { data: existing } = await client.from("google_accounts").select("refresh_token").maybeSingle();
  const refresh = t.refresh_token ?? (existing as { refresh_token?: string } | null)?.refresh_token;
  if (!refresh) return "Google didn't give a lasting sign-in. Remove Minute by Minute at myaccount.google.com/permissions, then connect again.";
  const { error } = await client.from("google_accounts").upsert({
    refresh_token: refresh,
    access_token: t.access_token,
    access_expires: new Date(Date.now() + (t.expires_in ?? 3000) * 1000).toISOString(),
    email,
    connected_at: new Date().toISOString(),
    synced_at: null,
  });
  if (error) return /google_accounts/.test(error.message) ? "Run supabase/minute-by-minute/030_suggestions.sql first." : error.message;
  await syncCalendar(client, { force: true });
  return null;
}

type Account = { refresh_token: string; access_token: string | null; access_expires: string | null; synced_at: string | null; email: string | null };

export async function googleStatus(client: SupabaseClient): Promise<{ connected: boolean; email: string | null; syncedAt: string | null } | null> {
  const { data, error } = await client.from("google_accounts").select("email, synced_at").maybeSingle();
  if (error) return null; // 030 not run yet
  return { connected: !!data, email: (data as { email?: string } | null)?.email ?? null, syncedAt: (data as { synced_at?: string } | null)?.synced_at ?? null };
}

// A working access token (refreshed when it's run out).
async function accessToken(client: SupabaseClient, a: Account): Promise<string | null> {
  if (a.access_token && a.access_expires && +new Date(a.access_expires) > Date.now() + 60_000) return a.access_token;
  const t = await tokenRequest({ refresh_token: a.refresh_token, grant_type: "refresh_token" });
  if (!t.access_token) return null;
  await client
    .from("google_accounts")
    .update({ access_token: t.access_token, access_expires: new Date(Date.now() + (t.expires_in ?? 3000) * 1000).toISOString() })
    .not("user_id", "is", null);
  return t.access_token;
}

type GEvent = {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
  transparency?: string;
};

// Copies your events in (a week back, two days ahead). Quietly does nothing if you haven't
// connected Google, or it synced in the last 10 minutes (unless forced).
export async function syncCalendar(client: SupabaseClient, { force = false } = {}): Promise<{ ok: boolean; count?: number; message?: string }> {
  if (!googleReady()) return { ok: false, message: "Google isn't set up on the website yet." };
  const { data, error } = await client.from("google_accounts").select("refresh_token, access_token, access_expires, synced_at, email").maybeSingle();
  if (error || !data) return { ok: false, message: error ? error.message : "Not connected." };
  const a = data as Account;
  if (!force && a.synced_at && Date.now() - +new Date(a.synced_at) < 10 * 60_000) return { ok: true };
  const token = await accessToken(client, a);
  if (!token) return { ok: false, message: "Google sign-in ran out: connect again." };
  const auth = { Authorization: `Bearer ${token}` };
  const from = new Date(Date.now() - 7 * 86400_000);
  const to = new Date(Date.now() + 2 * 86400_000);
  try {
    const list = (await (
      await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&maxResults=50", { headers: auth, signal: AbortSignal.timeout(6000), cache: "no-store" })
    ).json()) as { items?: { id: string; selected?: boolean; hidden?: boolean }[] };
    const calendars = (list.items ?? []).filter((c) => c.selected !== false && !c.hidden).slice(0, 12);
    const events: { id: string; title: string; start: string; end: string; allDay: boolean; location: string | null }[] = [];
    await Promise.all(
      calendars.map(async (c) => {
        const q = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "500" });
        const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.id)}/events?${q}`, { headers: auth, signal: AbortSignal.timeout(6000), cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { items?: GEvent[] };
        for (const e of body.items ?? []) {
          if (e.status === "cancelled") continue;
          if (e.attendees?.some((x) => x.self && x.responseStatus === "declined")) continue; // (you said no)
          const allDay = !e.start?.dateTime;
          const start = e.start?.dateTime ?? e.start?.date;
          const end = e.end?.dateTime ?? e.end?.date;
          if (!start || !end) continue;
          events.push({ id: `${c.id}:${e.id}`, title: e.summary ?? "", start: new Date(start).toISOString(), end: new Date(end).toISOString(), allDay, location: e.location ?? null });
        }
      }),
    );
    const { error: e2, data: n } = await client.rpc("sync_calendar", { p_from: from.toISOString(), p_to: to.toISOString(), p_events: events });
    if (e2) return { ok: false, message: e2.message };
    return { ok: true, count: Number(n) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Couldn't reach Google." };
  }
}
