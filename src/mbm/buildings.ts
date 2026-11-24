// A place's building outline, from OpenStreetMap (free, no account): the building the spot is
// inside, else the closest one within 25 m. Looked up in your browser, in the background, once
// per place, and saved (032_places_by_building.sql): it never holds the page up. null: not in a
// building (a bus stop, a park). undefined: couldn't ask right now (try again later).

export type Outline = [number, number][]; // [lat, lng], …

// Several public servers: the main one often turns away busy clouds like the website's host.
const SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// within: how far from the spot a building can be (a place's pin can sit on the pavement by its
// door: 45 m; an unnamed stop, 25 m, so one out on the street doesn't get the building next to it).
// insideOnly: only a building the spot is actually in (a stop: one on the sidewalk outside a
// building is outdoors, not in it). Otherwise the closest one will do (a place's pin is often
// on its edge or by its door).
export async function buildingAt(lat: number, lng: number, log?: string[], within = 25, insideOnly = false): Promise<Outline | null | undefined> {
  // OpenStreetMap's own database first (answers in a second or two); its search servers if not.
  const direct = await fromOsmApi(lat, lng, within, log);
  if (direct) return pick(direct, lat, lng, within, insideOnly);
  const at = `around:${within},${lat.toFixed(6)},${lng.toFixed(6)}`;
  // Buildings are simple shapes ("ways"), or for big ones (the library) a few pieces joined up
  // ("relations").
  const q = `[out:json][timeout:8];(way(${at})[building];relation(${at})[building];);out geom;`;
  for (const server of SERVERS) {
    try {
      // (A plain GET: works from a browser page and from a server alike.)
      const res = await fetch(`${server}?data=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(9000), cache: "no-store" });
      if (!res.ok) {
        log?.push(`${server}: HTTP ${res.status}`);
        continue;
      }
      const body = (await res.json()) as { remark?: string; elements?: Element[] };
      // A "remark" is the server giving up (busy, timed out): not an answer.
      if (body.remark || !Array.isArray(body.elements)) {
        log?.push(`${server}: ${body.remark ?? "no answer"}`);
        continue;
      }
      log?.push(`${server}: ${body.elements.length} building(s) nearby`);
      const shapes = body.elements.flatMap(shapesOf).filter((s) => s.length >= 4);
      if (!shapes.length) return null;
      const inside = shapes.filter((s) => contains(s, lat, lng));
      // Inside more than one (a building within a building): the smaller.
      if (inside.length) return inside.sort((a, b) => area(a) - area(b))[0];
      if (insideOnly) return null;
      return shapes.sort((a, b) => edgeDistance(a, lat, lng) - edgeDistance(b, lat, lng))[0];
    } catch (e) {
      log?.push(`${server}: ${e instanceof Error ? e.message : "failed"}`); // next server
    }
  }
  return undefined;
}

// The building a spot is in (the smaller, if one's in another), else the nearest within reach.
function pick(shapes: Outline[], lat: number, lng: number, within: number, insideOnly: boolean): Outline | null {
  if (!shapes.length) return null;
  const inside = shapes.filter((s) => contains(s, lat, lng));
  if (inside.length) return inside.sort((a, b) => area(a) - area(b))[0];
  if (insideOnly) return null;
  const near = shapes.filter((s) => edgeDistance(s, lat, lng) <= within);
  return near.length ? near.sort((a, b) => edgeDistance(a, lat, lng) - edgeDistance(b, lat, lng))[0] : null;
}

// The buildings around a spot from OpenStreetMap's main database (its map call: everything in a
// small box), for when the search servers (Overpass) are all busy. undefined: it didn't answer.
async function fromOsmApi(lat: number, lng: number, within: number, log?: string[]): Promise<Outline[] | undefined> {
  const dLat = (within + 30) / 110540;
  const dLng = (within + 30) / (111320 * Math.cos((lat * Math.PI) / 180));
  const box = [lng - dLng, lat - dLat, lng + dLng, lat + dLat].map((x) => x.toFixed(6)).join(",");
  try {
    const res = await fetch(`https://api.openstreetmap.org/api/0.6/map.json?bbox=${box}`, { signal: AbortSignal.timeout(15000), cache: "no-store" });
    if (!res.ok) {
      log?.push(`api.openstreetmap.org: HTTP ${res.status}`);
      return undefined;
    }
    type N = { type: "node"; id: number; lat: number; lon: number };
    type W = { type: "way"; id: number; nodes: number[]; tags?: Record<string, string> };
    type R = { type: "relation"; id: number; members: { type: string; ref: number; role?: string }[]; tags?: Record<string, string> };
    const body = (await res.json()) as { elements?: (N | W | R)[] };
    const els = body.elements ?? [];
    const nodes = new Map<number, [number, number]>();
    const ways = new Map<number, W>();
    for (const e of els) {
      if (e.type === "node") nodes.set(e.id, [e.lat, e.lon]);
      else if (e.type === "way") ways.set(e.id, e);
    }
    const geo = (w: W) => w.nodes.map((id) => nodes.get(id)).filter((p): p is [number, number] => !!p).map(([la, lo]) => ({ lat: la, lon: lo }));
    const shaped: Element[] = [];
    for (const w of ways.values()) if (w.tags?.building && w.nodes.length >= 4) shaped.push({ type: "way", geometry: geo(w) });
    for (const e of els) {
      if (e.type !== "relation" || !e.tags?.building) continue;
      const members = e.members.filter((m) => m.type === "way" && ways.has(m.ref)).map((m) => ({ role: m.role || "outer", geometry: geo(ways.get(m.ref)!) }));
      if (members.length) shaped.push({ type: "relation", members });
    }
    const shapes = shaped.flatMap(shapesOf).filter((s) => s.length >= 4);
    log?.push(`api.openstreetmap.org: ${shapes.length} building(s)`);
    return shapes;
  } catch (e) {
    log?.push(`api.openstreetmap.org: ${e instanceof Error ? (e.name === "TimeoutError" ? "no answer in 15s" : e.message) : "failed"}`);
    return undefined;
  }
}

type Geo = { lat: number; lon: number }[];
type Element = { type: string; geometry?: Geo; members?: { role?: string; geometry?: Geo }[] };

// A building's outline(s): a way's own shape, or a relation's outer pieces joined into rings.
function shapesOf(e: Element): Outline[] {
  const pts = (g: Geo = []) => g.map((p) => [p.lat, p.lon] as [number, number]);
  if (e.type === "way") return [pts(e.geometry)];
  const pieces = (e.members ?? []).filter((m) => (m.role ?? "outer") === "outer" && m.geometry?.length).map((m) => pts(m.geometry));
  const same = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1];
  const rings: Outline[] = [];
  while (pieces.length) {
    let ring = pieces.shift()!;
    for (let grew = true; grew && !same(ring[0], ring[ring.length - 1]); ) {
      grew = false;
      for (let i = 0; i < pieces.length; i++) {
        const p = pieces[i];
        const end = ring[ring.length - 1];
        if (same(p[0], end)) ring = [...ring, ...p.slice(1)];
        else if (same(p[p.length - 1], end)) ring = [...ring, ...[...p].reverse().slice(1)];
        else continue;
        pieces.splice(i, 1);
        grew = true;
        break;
      }
    }
    rings.push(ring);
  }
  return rings;
}

// Metres east / north of a spot.
const xy = (s: [number, number], lat: number, lng: number) => ({
  x: (s[1] - lng) * Math.cos((lat * Math.PI) / 180) * 111320,
  y: (s[0] - lat) * 110540,
});

export function contains(o: Outline, lat: number, lng: number) {
  let inside = false;
  for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
    const a = xy(o[i], lat, lng);
    const b = xy(o[j], lat, lng);
    if (a.y > 0 !== b.y > 0 && a.x + ((0 - a.y) * (b.x - a.x)) / (b.y - a.y) > 0) inside = !inside;
  }
  return inside;
}

export function edgeDistance(o: Outline, lat: number, lng: number) {
  let best = Infinity;
  for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
    const a = xy(o[i], lat, lng);
    const b = xy(o[j], lat, lng);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = dx * dx + dy * dy;
    const u = l ? Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / l)) : 0;
    best = Math.min(best, Math.hypot(a.x + u * dx, a.y + u * dy));
  }
  return best;
}

// In it, or within buf metres of its edge (as 021_buildings.sql's near_outline).
export const nearOutline = (o: Outline | null | undefined, lat: number, lng: number, buf = 12) =>
  !!o && o.length >= 3 && (contains(o, lat, lng) || edgeDistance(o, lat, lng) <= buf);

function area(o: Outline) {
  let s = 0;
  for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
    const a = xy(o[i], o[0][0], o[0][1]);
    const b = xy(o[j], o[0][0], o[0][1]);
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s / 2);
}

// The closest point of a building's outline to a spot (the spot itself when it's inside).
export function closestOnOutline(o: Outline, lat: number, lng: number): [number, number] {
  if (contains(o, lat, lng)) return [lat, lng];
  let best: [number, number] = o[0];
  let bestM = Infinity;
  for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
    const a = xy(o[i], lat, lng);
    const b = xy(o[j], lat, lng);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = dx * dx + dy * dy;
    const u = l ? Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / l)) : 0;
    const m = Math.hypot(a.x + u * dx, a.y + u * dy);
    if (m < bestM) {
      bestM = m;
      best = [o[i][0] + u * (o[j][0] - o[i][0]), o[i][1] + u * (o[j][1] - o[i][1])];
    }
  }
  return best;
}

// Next to each other, judged by buildings rather than a distance: nothing but open ground
// (streets, sidewalks, lawns) between a and b, other than the buildings they're in. Across Lake
// St from the Extension Bldg to Theory: yes. Across campus: no, buildings in the way.
// (Asks OpenStreetMap for the buildings the straight line touches. true / false; undefined:
// couldn't ask right now.)
// (Answers kept for this visit: asking the same two spots again is instant.)
const between = new Map<string, boolean>();

export async function nothingBetween(a: [number, number], b: [number, number]): Promise<boolean | undefined> {
  const f = (s: [number, number]) => `${s[0].toFixed(6)},${s[1].toFixed(6)}`;
  const key = `${f(a)}>${f(b)}`;
  if (between.has(key)) return between.get(key);
  // (3 is plenty: the two ends' own buildings, and one more means something's in the way.)
  const q = `[out:json][timeout:8];(way(around:1,${f(a)},${f(b)})[building];relation(around:1,${f(a)},${f(b)})[building];);out geom 3;`;
  const own = (s: [number, number]) => (o: Outline) => contains(o, s[0], s[1]) || edgeDistance(o, s[0], s[1]) <= 1;
  // The map servers are asked a moment apart, not one after another: the first good answer wins
  // and the rest are called off (one slow server used to hold up saving a stop for 30 seconds).
  const stop = new AbortController();
  const ask = async (server: string, wait: number) => {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    if (stop.signal.aborted) throw new Error("done");
    const own_ = new AbortController();
    const timer = setTimeout(() => own_.abort(), 9000);
    const off = () => own_.abort();
    stop.signal.addEventListener("abort", off);
    try {
      const res = await fetch(`${server}?data=${encodeURIComponent(q)}`, { signal: own_.signal, cache: "no-store" });
      if (!res.ok) throw new Error("busy");
      const body = (await res.json()) as { remark?: string; elements?: Element[] };
      if (body.remark || !Array.isArray(body.elements)) throw new Error("busy");
      return body.elements.every((e) => shapesOf(e).some((o) => o.length >= 4 && (own(a)(o) || own(b)(o))));
    } finally {
      clearTimeout(timer);
      stop.signal.removeEventListener("abort", off);
    }
  };
  try {
    const ok = await Promise.any(SERVERS.map((server, i) => ask(server, i * 1200)));
    stop.abort();
    between.set(key, ok);
    return ok;
  } catch {
    return undefined;
  }
}

// Every building around a spot (within metres), for picking the right one by hand. undefined:
// no server answered (log says what each did).
export async function buildingsNear(lat: number, lng: number, within = 120, log?: string[]): Promise<Outline[] | undefined> {
  // (You're waiting on this one: OpenStreetMap's own database first, it answers in a second or
  // two; the search servers if it doesn't.)
  const direct = await fromOsmApi(lat, lng, within, log);
  if (direct) return direct;
  const at = `around:${within},${lat.toFixed(6)},${lng.toFixed(6)}`;
  const q = `[out:json][timeout:12];(way(${at})[building];relation(${at})[building];);out geom;`;
  for (const server of SERVERS) {
    try {
      const res = await fetch(`${server}?data=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(14000), cache: "no-store" });
      if (!res.ok) {
        log?.push(`${new URL(server).host}: HTTP ${res.status}`);
        continue;
      }
      const body = (await res.json()) as { remark?: string; elements?: Element[] };
      if (body.remark || !Array.isArray(body.elements)) {
        log?.push(`${new URL(server).host}: ${body.remark ?? "no answer"}`);
        continue;
      }
      return body.elements.flatMap(shapesOf).filter((s) => s.length >= 4);
    } catch (e) {
      log?.push(`${new URL(server).host}: ${e instanceof Error ? (e.name === "TimeoutError" ? "no answer in 14s" : e.message) : "failed"}`);
    }
  }
  return undefined;
}

// One outline around several pieces of a building (Theory's wings): the shape around all their
// corners. One piece: itself.
export function around(pieces: Outline[]): Outline {
  if (pieces.length === 1) return pieces[0];
  const pts = pieces.flat().map(([a, b]) => [a, b] as [number, number]);
  pts.sort((p, q) => p[1] - q[1] || p[0] - q[0]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  return [...hull, hull[0]];
}
