import "server-only";

// An app's icon, by its name ("Instagram"): looked up on the App Store (Apple's free search),
// remembered for a month. null when there's no clear match (the page shows the app's first letter).
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

type Result = { trackName?: string; artistName?: string; artworkUrl100?: string; artworkUrl512?: string };

async function search(term: string): Promise<Result[]> {
  const res = await fetch(`https://itunes.apple.com/search?entity=software&country=us&limit=8&term=${encodeURIComponent(term)}`, {
    next: { revalidate: 60 * 60 * 24 * 30 },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) return [];
  return ((await res.json()) as { results?: Result[] }).results ?? [];
}

// 256px: sharp on a high-res screen (shown at 36px), still small to load.
const art = (r: Result | undefined) => r?.artworkUrl512?.replace("512x512bb", "256x256bb") ?? r?.artworkUrl100?.replace("100x100bb", "256x256bb") ?? null;

export async function iconFor(name: string): Promise<string | null> {
  name = name.trim().slice(0, 80);
  if (!name) return null;
  const want = norm(name);
  try {
    const results = await search(name);
    // The app whose name is the one you used, or starts with it ("YouTube: Watch, Listen, Stream").
    const hit =
      results.find((r) => norm(r.trackName ?? "") === want) ??
      results.find((r) => {
        const t = (r.trackName ?? "").toLowerCase();
        return want.length >= 3 && norm(t.split(/[:\-–—|(]/)[0]) === want;
      });
    if (hit) return art(hit);
    // Apple's own apps with a common name ("Maps", "Clock"): other apps crowd them out of the
    // search, so one more try as "Apple Maps", taking only an app made by Apple with that name.
    const apple = (await search(`Apple ${name}`)).find(
      (r) => r.artistName === "Apple" && [want, `apple${want}`].includes(norm(r.trackName ?? "")),
    );
    return art(apple);
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
