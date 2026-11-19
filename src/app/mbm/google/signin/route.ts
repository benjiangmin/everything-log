import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { consentUrl, googleReady } from "@/mbm/google";

// "Continue with Google" on the sign-in page: off to Google (back to /mbm/google/callback,
// which signs you in). ?calendar=1 asks for your calendar in the same step.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  if (!googleReady()) return Response.redirect(`${origin}/mbm/login?google=not-set-up`, 302);
  const calendar = url.searchParams.get("calendar") === "1";
  const next = url.searchParams.get("next")?.startsWith("/mbm") ? url.searchParams.get("next")! : "/mbm";
  const state = randomBytes(16).toString("hex");
  const store = await cookies();
  store.set("mbm_google_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/mbm/google", maxAge: 600 });
  store.set("mbm_google_signin", JSON.stringify({ next }), { httpOnly: true, secure: true, sameSite: "lax", path: "/mbm/google", maxAge: 600 });
  return Response.redirect(consentUrl(origin, state, { calendar }), 302);
}
