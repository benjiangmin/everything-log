// An app's icon, by its name ("Instagram"): looked up on the App Store (Apple's free search) and
// sent on as a redirect to the picture. Remembered for a month. 404 when there's no clear match
// (Apple's own apps like Messages aren't in the store): the page shows the app's first letter.
export async function GET(req: Request) {
  const name = (new URL(req.url).searchParams.get("name") ?? "").trim().slice(0, 80);
  if (!name) return new Response(null, { status: 404 });
  const url = await iconFor(name);
  if (!url) return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=86400" } });
  return Response.redirect(url, 302);
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

async function iconFor(name: string): Promise<string | null> {
  try {
    const res = await fetch(`https://itunes.apple.com/search?entity=software&country=us&limit=8&term=${encodeURIComponent(name)}`, {
      next: { revalidate: 60 * 60 * 24 * 30 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { results?: { trackName?: string; artworkUrl100?: string; artworkUrl512?: string }[] };
    const want = norm(name);
    // The app whose name is the one you used, or starts with it ("YouTube: Watch, Listen, Stream").
    const hit =
      body.results?.find((r) => norm(r.trackName ?? "") === want) ??
      body.results?.find((r) => {
        const t = (r.trackName ?? "").toLowerCase();
        return want.length >= 3 && norm(t.split(/[:\-–—|(]/)[0]) === want;
      });
    return hit?.artworkUrl100?.replace("100x100bb", "128x128bb") ?? null;
  } catch {
    return null;
  }
}
