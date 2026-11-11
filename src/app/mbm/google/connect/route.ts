import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { consentUrl, googleReady } from "@/mbm/google";
import { mbmUser } from "@/mbm/supabase";

// "Connect Google Calendar": off to Google's consent screen (and back to /mbm/google/callback).
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  if (!(await mbmUser())) return Response.redirect(`${origin}/mbm/login?next=/mbm`, 302);
  if (!googleReady()) return Response.redirect(`${origin}/mbm?google=not-set-up`, 302);
  const state = randomBytes(16).toString("hex");
  (await cookies()).set("mbm_google_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/mbm/google", maxAge: 600 });
  return Response.redirect(consentUrl(origin, state), 302);
}
