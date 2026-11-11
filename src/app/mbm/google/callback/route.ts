import { cookies } from "next/headers";
import { finishConnect } from "@/mbm/google";
import { mbm, mbmUser } from "@/mbm/supabase";

// Back from Google: check it's the sign-in we started, save it, copy the calendar in.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const back = (status: string) => Response.redirect(`${origin}/mbm?google=${encodeURIComponent(status)}`, 302);
  if (!(await mbmUser())) return Response.redirect(`${origin}/mbm/login?next=/mbm`, 302);
  const store = await cookies();
  const expected = store.get("mbm_google_state")?.value;
  store.delete({ name: "mbm_google_state", path: "/mbm/google" });
  if (url.searchParams.get("error")) return back("cancelled");
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) return back("try-again");
  const problem = await finishConnect(await mbm(), origin, code);
  return back(problem ? `error:${problem}` : "connected");
}
