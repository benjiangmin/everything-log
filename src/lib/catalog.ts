import "server-only";

// Looking titles up in the big public databases, so names are standard and come with a cover:
//   anime → AniList (free, no key; English titles, falling back to the Japanese romaji)
//   games → IGDB (free; needs TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET from a Twitch developer app)

export type Match = {
  source_id: string; // "anilist:16498" / "igdb:1942"
  title: string;
  cover_url: string | null;
  year: number | null;
  movie?: boolean; // anime only
};

// Only pictures from these two places are saved (the form could be tampered with).
export function safeCover(url: unknown): string | null {
  if (typeof url !== "string" || !url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "s4.anilist.co" || u.hostname === "images.igdb.com") ? u.toString() : null;
  } catch {
    return null;
  }
}
export const safeSourceId = (id: unknown) => (typeof id === "string" && /^(anilist|igdb):\d{1,12}$/.test(id) ? id : null);

// ---------- Anime: AniList ----------

const ANILIST_QUERY = `query ($q: String) {
  Page(perPage: 8) {
    media(search: $q, type: ANIME, isAdult: false, sort: SEARCH_MATCH) {
      id
      title { english romaji }
      coverImage { medium }
      seasonYear
      startDate { year }
      format
    }
  }
}`;

type AniListMedia = {
  id: number;
  title: { english: string | null; romaji: string | null };
  coverImage: { medium: string | null } | null;
  seasonYear: number | null;
  startDate: { year: number | null } | null;
  format: string | null;
};

export async function searchAniList(q: string): Promise<Match[]> {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: ANILIST_QUERY, variables: { q } }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`AniList said ${res.status}`);
  const json = (await res.json()) as { data?: { Page?: { media?: AniListMedia[] } } };
  return (json.data?.Page?.media ?? []).map((m) => ({
    source_id: `anilist:${m.id}`,
    title: (m.title.english || m.title.romaji || "").trim(),
    cover_url: m.coverImage?.medium ?? null,
    year: m.seasonYear ?? m.startDate?.year ?? null,
    movie: m.format === "MOVIE",
  })).filter((m) => m.title);
}

// ---------- Games: IGDB (through Twitch) ----------

let token: { value: string; until: number } | null = null; // reused until it expires (~60 days)

async function igdbToken(): Promise<string | null> {
  const id = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (token && Date.now() < token.until) return token.value;
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secret)}&grant_type=client_credentials`,
    { method: "POST", cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Twitch said ${res.status} (check TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET)`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: json.access_token, until: Date.now() + (json.expires_in - 3600) * 1000 };
  return token.value;
}

export const igdbReady = () => Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);

export async function searchIGDB(q: string): Promise<Match[]> {
  const bearer = await igdbToken();
  if (!bearer) return [];
  const safe = q.replace(/["\\]/g, " ").slice(0, 80);
  const res = await fetch("https://api.igdb.com/v4/games", {
    method: "POST",
    headers: { "Client-ID": process.env.TWITCH_CLIENT_ID!, Authorization: `Bearer ${bearer}`, Accept: "application/json" },
    body: `search "${safe}"; fields name, cover.image_id, first_release_date; limit 8;`,
    cache: "no-store",
  });
  if (res.status === 401) token = null; // expired early: get a new one next time
  if (!res.ok) throw new Error(`IGDB said ${res.status}`);
  const rows = (await res.json()) as { id: number; name: string; cover?: { image_id: string }; first_release_date?: number }[];
  return rows.map((g) => ({
    source_id: `igdb:${g.id}`,
    title: g.name,
    cover_url: g.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_small_2x/${g.cover.image_id}.jpg` : null,
    year: g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null,
  }));
}
