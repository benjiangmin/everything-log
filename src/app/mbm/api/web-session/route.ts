import { mbm } from "@/mbm/supabase";

// For the phone app's Map (/embed/map, shown inside the app): signs this web view in with the
// phone's sign-in, then opens the map.
//   POST /mbm/api/web-session   form: access_token=…
// Only the phone's access token comes over, never its refresh token: the web view's sign-in ends
// when that token does (an hour), and the app signs it in again. (Sharing the refresh token would
// let the website use it up and sign the phone out.)
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const token = form?.get("access_token");
  if (typeof token !== "string" || token.length < 20) return new Response("Sign in first.", { status: 401 });
  const client = await mbm();
  const { error } = await client.auth.setSession({ access_token: token, refresh_token: "phone-app" });
  if (error) return new Response("Sign in first.", { status: 401 });
  // (top: how far down the phone's clock and battery reach, in points, so the map's bubble and
  // buttons line up with the app's laptop tab.)
  const top = Math.round(Number(form?.get("top")));
  return new Response(null, { status: 303, headers: { Location: Number.isFinite(top) && top > 0 && top < 200 ? `/embed/map?top=${top}` : "/embed/map" } });
}
