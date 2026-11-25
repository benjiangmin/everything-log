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
  // (top: how far the phone's clock and battery reach into this page, in points (0 when the page
  // starts below them), so the map's bubble and buttons line up with the app's laptop tab.)
  const raw = form?.get("top");
  const top = typeof raw === "string" && raw.trim() !== "" ? Math.round(Number(raw)) : NaN;
  // (bottom: the home bar's space at the bottom, so "At Home! since…" sits just above the tab bar.)
  const rawB = form?.get("bottom");
  const bottom = typeof rawB === "string" && rawB.trim() !== "" ? Math.round(Number(rawB)) : NaN;
  const q = new URLSearchParams();
  if (Number.isFinite(top) && top >= 0 && top < 200) q.set("top", String(top));
  if (Number.isFinite(bottom) && bottom >= 0 && bottom < 100) q.set("bottom", String(bottom));
  return new Response(null, { status: 303, headers: { Location: q.size ? `/embed/map?${q}` : "/embed/map" } });
}
