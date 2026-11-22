import "server-only";

// An app's icon, by its name ("Instagram"): looked up on the App Store (Apple's free search),
// remembered for a month. null when there's no clear match (the page shows the app's first letter).
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

export async function iconFor(name: string): Promise<string | null> {
  name = name.trim().slice(0, 80);
  if (!name) return null;
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
    // 256px: sharp on a high-res screen (shown at 36px), still small to load.
    return hit?.artworkUrl512?.replace("512x512bb", "256x256bb") ?? hit?.artworkUrl100?.replace("100x100bb", "256x256bb") ?? null;
  } catch {
    return null;
  }
}

// Several at once (for a page: it waits for them, so the icons come in with it).
export async function iconsFor(names: string[]): Promise<Record<string, string | null>> {
  const unique = [...new Set(names)];
  const urls = await Promise.all(unique.map(iconFor));
  return Object.fromEntries(unique.map((n, i) => [n, urls[i]]));
}
