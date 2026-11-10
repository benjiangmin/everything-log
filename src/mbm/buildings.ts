// A stop's building outline (021_buildings.sql), when it has one. Looking them up from
// OpenStreetMap was taken out (its free servers were too slow and timed the Day page out), so for
// now none are filled in and stops just show their circle.

export type Outline = [number, number][]; // [lat, lng], …

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
