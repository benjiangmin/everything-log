import { cookies } from "next/headers";
import { exchangeCode, grantedCalendar, saveTokens } from "@/mbm/google";
import { mbm, mbmUser } from "@/mbm/supabase";

// Back from Google. Two ways in:
//   - connecting your calendar (you're signed in): save it, copy your events in;
//   - "Continue with Google" on the sign-in page: sign in to Minute by Minute with Google's
//     word for who you are (Supabase's Google sign-in, given Google's ID token), and if you
//     also said yes to your calendar, connect it in the same go.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const store = await cookies();
  const expected = store.get("mbm_google_state")?.value;
  const signin = store.get("mbm_google_signin")?.value;
  store.delete({ name: "mbm_google_state", path: "/mbm/google" });
  store.delete({ name: "mbm_google_signin", path: "/mbm/google" });
  const backHome = (status: string) => Response.redirect(`${origin}/mbm?google=${encodeURIComponent(status)}`, 302);
  const backLogin = (status: string) => Response.redirect(`${origin}/mbm/login?google=${encodeURIComponent(status)}`, 302);
  const back = signin ? backLogin : backHome;

  if (url.searchParams.get("error")) return back("cancelled");
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) return back("try-again");
  const client = await mbm();

  if (signin) {
    const t = await exchangeCode(origin, code);
    if (!t.id_token) return backLogin(`error:${t.error_description ?? t.error ?? "Google didn't say yes."}`);
    const { error } = await client.auth.signInWithIdToken({ provider: "google", token: t.id_token, access_token: t.access_token });
    if (error) return backLogin(`error:${/provider is not enabled|not enabled/i.test(error.message) ? "Turn on Google in Supabase (Authentication → Sign In / Providers → Google) first." : error.message}`);
    if (grantedCalendar(t)) await saveTokens(client, t);
    let next = "/mbm";
    try {
      next = (JSON.parse(signin) as { next?: string }).next ?? "/mbm";
    } catch {}
    return Response.redirect(`${origin}${next}`, 302);
  }

  if (!(await mbmUser())) return Response.redirect(`${origin}/mbm/login?next=/mbm`, 302);
  const problem = await saveTokens(client, await exchangeCode(origin, code));
  return backHome(problem ? `error:${problem}` : "connected");
}
