import { iconFor } from "@/mbm/appIcons";

// An app's icon, by its name: a redirect to the picture (see iconFor). 404 when there's no clear
// match (Apple's own apps like Messages aren't always in the store). The browser keeps the answer.
export async function GET(req: Request) {
  const url = await iconFor(new URL(req.url).searchParams.get("name") ?? "");
  if (!url) return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=86400" } });
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "public, max-age=604800" } });
}
