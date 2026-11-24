import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { consentUrl, googleReady } from "@/mbm/google";

// "Continue with Google" in the phone app. The app opens this in its sign-in sheet (so iPhone
// says it wants to use benbadobee.com to sign in, not the database's address), it goes to Google
// (your calendar in the same step), and /mbm/google/callback hands Google's word for who you are
// back to the app at minutebyminute://auth-callback, which signs in with it.
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  if (!googleReady()) return Response.redirect("minutebyminute://auth-callback#error=not-set-up", 302);
  const state = randomBytes(16).toString("hex");
  const store = await cookies();
  store.set("mbm_google_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/mbm/google", maxAge: 600 });
  store.set("mbm_google_signin", JSON.stringify({ next: "/mbm", phone: true }), { httpOnly: true, secure: true, sameSite: "lax", path: "/mbm/google", maxAge: 600 });
  return Response.redirect(consentUrl(origin, state, { calendar: true }), 302);
}
