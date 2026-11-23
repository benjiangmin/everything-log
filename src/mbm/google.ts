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

const CALENDAR = "https://www.googleapis.com/auth/calendar.readonly";
// (Adding, moving and deleting events from the Plan tab: 041_plan.sql.)
export const WRITE = "https://www.googleapis.com/auth/calendar.events";
const SCOPES = ["openid", "email", CALENDAR, WRITE];
export const redirectUri = (origin: string) => `${origin}/mbm/google/callback`;

// Connecting the calendar (signed in already), or signing in with Google (calendar optional:
// `calendar` false asks for just who you are).
export function consentUrl(origin: string, state: string, { calendar = true }: { calendar?: boolean } = {}) {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: (calendar ? SCOPES : ["openid", "email"]).join(" "),
    ...(calendar ? { access_type: "offline", prompt: "consent" } : { prompt: "select_account" }), // (offline: a refresh token, so it keeps working)
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

type TokenAnswer = { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; scope?: string; error?: string; error_description?: string };

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

// After "Allow": the code swapped for tokens.
export async function exchangeCode(origin: string, code: string) {
  return tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri(origin) });
}
export const grantedCalendar = (t: TokenAnswer & { scope?: string }) => (t.scope ?? "").split(" ").includes(CALENDAR);

// After "Allow": swaps the code for tokens and saves them (yours only: row level security).
export async function finishConnect(client: SupabaseClient, origin: string, code: string): Promise<string | null> {
  return saveTokens(client, await exchangeCode(origin, code));
}

export async function saveTokens(client: SupabaseClient, t: TokenAnswer): Promise<string | null> {
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
    ...(t.scope ? { scope: t.scope } : {}),
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
  // TESTING (Nov 23): every minute, so a calendar event made just now shows up fast. Back to 10 * 60_000 after.
  if (!force && a.synced_at && Date.now() - +new Date(a.synced_at) < 60_000) return { ok: true };
  const token = await accessToken(client, a);
  if (!token) return { ok: false, message: "Google sign-in ran out: connect again." };
  const auth = { Authorization: `Bearer ${token}` };
  const from = new Date(Date.now() - 7 * 86400_000);
  const to = new Date(Date.now() + 21 * 86400_000); // (three weeks ahead, for planning)
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

// ---------- Writing to your calendar (the Plan tab) ----------

// Can we add to your calendar? (You said yes to calendar.events when connecting.)
export async function canWrite(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client.from("google_accounts").select("scope").maybeSingle();
  if (error || !data) return false;
  return ((data as { scope?: string | null }).scope ?? "").split(" ").includes(WRITE);
}

async function writeAuth(client: SupabaseClient): Promise<{ token: string; primary: string } | string> {
  const { data } = await client.from("google_accounts").select("refresh_token, access_token, access_expires, synced_at, email").maybeSingle();
  if (!data) return "Google isn't connected.";
  const token = await accessToken(client, data as Account);
  if (!token) return "Google sign-in ran out: connect again.";
  return { token, primary: (data as Account).email ?? "primary" };
}

type Times = { title: string; start: string; end: string; location: string | null };
const body = (e: Times) => ({
  summary: e.title,
  location: e.location ?? undefined,
  start: { dateTime: e.start },
  end: { dateTime: e.end },
});

// A new event on your main calendar. Returns its id as calendar_events keeps it, or a problem.
export async function createGoogleEvent(client: SupabaseClient, e: Times): Promise<{ id: string } | { problem: string }> {
  const a = await writeAuth(client);
  if (typeof a === "string") return { problem: a };
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${a.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body(e)),
    signal: AbortSignal.timeout(8000),
  });
  const j = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!res.ok || !j.id) return { problem: res.status === 403 ? "Google didn't allow adding events: reconnect Google from Your account." : (j.error?.message ?? `Google said ${res.status}.`) };
  return { id: `${a.primary}:${j.id}` };
}

const split = (id: string) => {
  const i = id.lastIndexOf(":");
  return { calendar: id.slice(0, i), event: id.slice(i + 1) };
};

export async function updateGoogleEvent(client: SupabaseClient, id: string, e: Times): Promise<string | null> {
  const a = await writeAuth(client);
  if (typeof a === "string") return a;
  const { calendar, event } = split(id);
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar)}/events/${encodeURIComponent(event)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${a.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body(e)),
    signal: AbortSignal.timeout(8000),
  });
  if (res.ok) return null;
  return res.status === 403 ? "This event's calendar can't be changed from here (or Google needs reconnecting)." : `Google said ${res.status}.`;
}

export async function deleteGoogleEvent(client: SupabaseClient, id: string): Promise<string | null> {
  const a = await writeAuth(client);
  if (typeof a === "string") return a;
  const { calendar, event } = split(id);
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar)}/events/${encodeURIComponent(event)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${a.token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (res.ok || res.status === 404 || res.status === 410) return null;
  return res.status === 403 ? "This event's calendar can't be changed from here (or Google needs reconnecting)." : `Google said ${res.status}.`;
}
