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
  have?: string; // already on your list: where ("Completed", "Plan to watch"…)
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
// "none" = you chose to keep your own title (Find covers stops asking about it).
export const safeSourceId = (id: unknown) =>
  typeof id === "string" && /^((anilist|igdb):\d{1,12}|none)$/.test(id) ? id : null;

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

const MEDIA_FIELDS = "id title { english romaji } coverImage { medium } seasonYear startDate { year } format";

const fromAniList = (list: AniListMedia[] = []): Match[] =>
  list
    .map((m) => ({
      source_id: `anilist:${m.id}`,
      title: (m.title.english || m.title.romaji || "").trim(),
      cover_url: m.coverImage?.medium ?? null,
      year: m.seasonYear ?? m.startDate?.year ?? null,
      movie: m.format === "MOVIE",
    }))
    .filter((m) => m.title);

// Too many requests: the error says how long to wait (seconds).
export class RateLimited extends Error {
  constructor(public wait: number) {
    super("Too many lookups, waiting a moment");
  }
}

async function anilist<T>(query: string, variables: Record<string, string>): Promise<T> {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (res.status === 429) throw new RateLimited(Number(res.headers.get("Retry-After")) || 60);
  if (!res.ok) throw new Error(`AniList said ${res.status}`);
  return ((await res.json()) as { data: T }).data;
}

export async function searchAniList(q: string): Promise<Match[]> {
  const data = await anilist<{ Page?: { media?: AniListMedia[] } }>(ANILIST_QUERY, { q });
  return fromAniList(data?.Page?.media);
}

// Several titles in one request (each gets its own top 5), for Find covers.
export async function searchAniListMany(titles: string[]): Promise<Match[][]> {
  if (!titles.length) return [];
  const vars = titles.map((_, i) => `$q${i}: String`).join(", ");
  const parts = titles
    .map((_, i) => `a${i}: Page(perPage: 5) { media(search: $q${i}, type: ANIME, isAdult: false, sort: SEARCH_MATCH) { ${MEDIA_FIELDS} } }`)
    .join("\n");
  const data = await anilist<Record<string, { media?: AniListMedia[] } | null>>(
    `query (${vars}) {\n${parts}\n}`,
    Object.fromEntries(titles.map((t, i) => [`q${i}`, t])),
  );
  return titles.map((_, i) => fromAniList(data?.[`a${i}`]?.media));
}

// ---------- Anime seasons: walking a show's sequel / prequel links ----------

export type SeasonNode = {
  id: number;
  title: string;
  cover_url: string | null;
  year: number | null;
  start: number; // yyyymmdd (for ordering), 99999999 if unknown
  format: string | null; // TV, TV_SHORT, ONA, MOVIE, OVA, SPECIAL…
  status: string | null; // FINISHED, RELEASING, NOT_YET_RELEASED, CANCELLED…
  links: number[]; // SEQUEL / PREQUEL neighbours
};

const SEASON_QUERY = `query ($ids: [Int]) {
  Page(perPage: 50) {
    media(id_in: $ids, type: ANIME) {
      id title { english romaji } coverImage { medium } seasonYear startDate { year month day } format status
      relations { edges { relationType node { id type } } }
    }
  }
}`;

type SeasonMedia = AniListMedia & {
  startDate: { year: number | null; month?: number | null; day?: number | null } | null;
  status: string | null;
  relations: { edges: { relationType: string; node: { id: number; type: string } }[] } | null;
};

// Up to 50 shows in one request.
export async function aniListSeasons(ids: number[]): Promise<SeasonNode[]> {
  if (!ids.length) return [];
  const query = SEASON_QUERY;
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables: { ids: ids.slice(0, 50) } }),
    cache: "no-store",
  });
  if (res.status === 429) throw new RateLimited(Number(res.headers.get("Retry-After")) || 60);
  if (!res.ok) throw new Error(`AniList said ${res.status}`);
  const json = (await res.json()) as { data?: { Page?: { media?: SeasonMedia[] } } };
  return (json.data?.Page?.media ?? []).map((m) => {
    const d = m.startDate;
    return {
      id: m.id,
      title: (m.title.english || m.title.romaji || "").trim(),
      cover_url: m.coverImage?.medium ?? null,
      year: m.seasonYear ?? d?.year ?? null,
      start: d?.year ? d.year * 10000 + (d.month ?? 12) * 100 + (d.day ?? 31) : 99999999,
      format: m.format,
      status: m.status,
      links: (m.relations?.edges ?? [])
        .filter((e) => (e.relationType === "SEQUEL" || e.relationType === "PREQUEL") && e.node.type === "ANIME")
        .map((e) => e.node.id),
    };
  });
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

type IGDBGame = { id: number; name: string; cover?: { image_id: string }; first_release_date?: number };

const fromIGDB = (rows: IGDBGame[] = []): Match[] =>
  rows.map((g) => ({
    source_id: `igdb:${g.id}`,
    title: g.name,
    cover_url: g.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_small_2x/${g.cover.image_id}.jpg` : null,
    year: g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null,
  }));

const igdbSafe = (q: string) => q.replace(/["\\]/g, " ").slice(0, 80);

async function igdb<T>(path: string, body: string): Promise<T | null> {
  const bearer = await igdbToken();
  if (!bearer) return null;
  const res = await fetch(`https://api.igdb.com/v4/${path}`, {
    method: "POST",
    headers: { "Client-ID": process.env.TWITCH_CLIENT_ID!, Authorization: `Bearer ${bearer}`, Accept: "application/json" },
    body,
    cache: "no-store",
  });
  if (res.status === 401) token = null; // expired early: get a new one next time
  if (res.status === 429) throw new RateLimited(1);
  if (!res.ok) throw new Error(`IGDB said ${res.status}`);
  return (await res.json()) as T;
}

export async function searchIGDB(q: string): Promise<Match[]> {
  const rows = await igdb<IGDBGame[]>("games", `search "${igdbSafe(q)}"; fields name, cover.image_id, first_release_date; limit 8;`);
  return fromIGDB(rows ?? []);
}

// Up to 10 titles in one request (IGDB's multiquery), for Find covers.
export async function searchIGDBMany(titles: string[]): Promise<Match[][]> {
  if (!titles.length) return [];
  const body = titles
    .map((t, i) => `query games "g${i}" { search "${igdbSafe(t)}"; fields name, cover.image_id, first_release_date; limit 5; };`)
    .join("\n");
  const rows = (await igdb<{ name: string; result: IGDBGame[] }[]>("multiquery", body)) ?? [];
  return titles.map((_, i) => fromIGDB(rows.find((r) => r.name === `g${i}`)?.result));
}
