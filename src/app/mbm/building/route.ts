import { buildingAt } from "@/mbm/buildings";
import { mbmUser } from "@/mbm/supabase";

// A check for the building lookup, from the website's own server: /mbm/building?lat=…&lng=…
// (signed in only). Says what each map server answered, and the outline it picked.
export async function GET(req: Request) {
  if (!(await mbmUser())) return Response.json({ error: "Sign in first." }, { status: 401 });
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat") ?? 43.07548);
  const lng = Number(url.searchParams.get("lng") ?? -89.39845); // (Memorial Library)
  if (![lat, lng].every(Number.isFinite)) return Response.json({ error: "lat and lng, please." }, { status: 400 });
  const log: string[] = [];
  const outline = await buildingAt(lat, lng, log);
  return Response.json({ lat, lng, found: outline === undefined ? "couldn't ask" : outline ? `${outline.length} corners` : "not in a building", servers: log });
}
