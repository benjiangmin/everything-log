import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { consentUrl, googleReady } from "@/mbm/google";
import { mbmUser } from "@/mbm/supabase";
import { baseFor } from "@/mbm/paths";

// "Connect Google Calendar": off to Google's consent screen (and back to /mbm/google/callback).
// ?next=/mbm/... comes back there instead of Home (the setup's calendar slide).
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const base = baseFor(origin); // ("" on minutexminute.com, "/mbm" on the old address)
  if (!(await mbmUser())) return Response.redirect(`${origin}${base}/login?next=/`, 302);
  if (!googleReady()) return Response.redirect(`${origin}${base}/?google=not-set-up`, 302);
  const state = randomBytes(16).toString("hex");
  const store = await cookies();
  store.set("mbm_google_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  const next = new URL(req.url).searchParams.get("next");
  if (next?.startsWith("/") && !next.startsWith("//")) store.set("mbm_google_next", next, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  else store.delete({ name: "mbm_google_next", path: "/" });
  return Response.redirect(consentUrl(origin, state), 302);
}
