// The outline of the building a stop is in, from OpenStreetMap (the Overpass API: free, no
// account). The building the spot is inside; else the closest one within 25 m (GPS is rough
// indoors). null: not in a building (a bus stop, a park). undefined: couldn't ask (offline, busy):
// try again next time.

export type Outline = [number, number][]; // [lat, lng], …

// Several public servers: the main one often turns away busy clouds like the website's host.
const SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

export async function buildingAt(lat: number, lng: number, log?: string[]): Promise<Outline | null | undefined> {
  const at = `around:25,${lat.toFixed(6)},${lng.toFixed(6)}`;
  // Buildings are simple shapes ("ways"), or for big ones (the library) a few pieces joined up
  // ("relations").
  const q = `[out:json][timeout:8];(way(${at})[building];relation(${at})[building];);out geom;`;
  for (const server of SERVERS) {
    try {
      const res = await fetch(server, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", "User-Agent": "MinuteByMinute/1.0 (benbadobee.com)" },
        body: "data=" + encodeURIComponent(q),
        signal: AbortSignal.timeout(7000),
        cache: "no-store",
      });
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
      return shapes.sort((a, b) => edgeDistance(a, lat, lng) - edgeDistance(b, lat, lng))[0];
    } catch (e) {
      log?.push(`${server}: ${e instanceof Error ? e.message : "failed"}`); // next server
    }
  }
  return undefined;
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
