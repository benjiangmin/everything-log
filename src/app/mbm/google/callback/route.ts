import { cookies } from "next/headers";
import { exchangeCode, grantedCalendar, NO_CALENDAR, saveTokens } from "@/mbm/google";
import { mbm, mbmUser } from "@/mbm/supabase";
import { baseFor } from "@/mbm/paths";

// Back from Google. Two ways in:
//   - connecting your calendar (you're signed in): save it, copy your events in;
//   - "Continue with Google" on the sign-in page: sign in to Minute by Minute with Google's
//     word for who you are (Supabase's Google sign-in, given Google's ID token), and if you
//     also said yes to your calendar, connect it in the same go.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const base = baseFor(origin); // ("" on minutexminute.com, "/mbm" on the old address)
  const store = await cookies();
  const expected = store.get("mbm_google_state")?.value;
  const signin = store.get("mbm_google_signin")?.value;
  const after = store.get("mbm_google_next")?.value; // (connecting from the setup: back there)
  store.delete({ name: "mbm_google_next", path: "/" });
  store.delete({ name: "mbm_google_state", path: "/" });
  store.delete({ name: "mbm_google_signin", path: "/" });
  const home = after?.startsWith("/") && !after.startsWith("//") ? after : `${base}/`;
  const backHome = (status: string) => Response.redirect(`${origin}${home}${home.includes("?") ? "&" : "?"}google=${encodeURIComponent(status)}`, 302);
  const backLogin = (status: string) => Response.redirect(`${origin}${base}/login?google=${encodeURIComponent(status)}`, 302);
  // (From the phone app's sign-in sheet: everything goes back to the app, /mbm/google/phone.)
  let phone = false;
  try {
    phone = !!signin && !!(JSON.parse(signin) as { phone?: boolean }).phone;
  } catch {}
  const toApp = (q: Record<string, string>) => Response.redirect(`minutebyminute://auth-callback#${new URLSearchParams(q)}`, 302);
  const back = phone ? (status: string) => toApp({ error: status }) : signin ? backLogin : backHome;

  if (url.searchParams.get("error")) return back("cancelled");
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) return back("try-again");
  const client = await mbm();

  if (signin) {
    const t = await exchangeCode(origin, code);
    if (!t.id_token) return phone ? toApp({ error: t.error_description ?? t.error ?? "Google didn't say yes." }) : backLogin(`error:${t.error_description ?? t.error ?? "Google didn't say yes."}`);
    const { error } = await client.auth.signInWithIdToken({ provider: "google", token: t.id_token, access_token: t.access_token });
    if (error && phone) return toApp({ error: error.message });
    if (error) return backLogin(`error:${/provider is not enabled|not enabled/i.test(error.message) ? "Turn on Google in Supabase (Authentication → Sign In / Providers → Google) first." : error.message}`);
    if (grantedCalendar(t)) await saveTokens(client, t);
    // The phone signs in with the same word from Google (and your calendar's now connected).
    if (phone) return toApp({ id_token: t.id_token, ...(t.access_token ? { access_token: t.access_token } : {}) });
    let next = `${base}/`;
    try {
      next = (JSON.parse(signin) as { next?: string }).next ?? `${base}/`;
    } catch {}
    // (Signed in, but the calendar box was left unticked: say so on the home page.)
    if (!grantedCalendar(t)) next = `${base}/?google=${encodeURIComponent(`error:${NO_CALENDAR}`)}`;
    return Response.redirect(`${origin}${next}`, 302);
  }

  if (!(await mbmUser())) return Response.redirect(`${origin}${base}/login?next=/`, 302);
  const problem = await saveTokens(client, await exchangeCode(origin, code));
  return backHome(problem ? `error:${problem}` : "connected");
}
