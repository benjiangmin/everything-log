// Sunrise and sunset for a spot and day (the NOAA sunrise equation, good to a minute or two).
// Returns epoch ms, or null in polar day/night.
export function sunTimes(at: number, lat: number, lng: number): { rise: number; set: number } | null {
  const rad = Math.PI / 180;
  const day = Math.floor(at / 86400000 + 2440587.5 - 2451545.0 + 0.0008 + 0.5); // Julian day number (from J2000)
  const jStar = day - lng / 360;
  const M = (357.5291 + 0.98560028 * jStar) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const transit = 2451545.0 + jStar + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lambda * rad);
  const dec = Math.asin(Math.sin(lambda * rad) * Math.sin(23.4397 * rad));
  const cosH = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(dec)) / (Math.cos(lat * rad) * Math.cos(dec));
  if (cosH < -1 || cosH > 1) return null;
  const H = Math.acos(cosH) / rad;
  const toMs = (j: number) => (j - 2440587.5) * 86400000;
  return { rise: toMs(transit - H / 360), set: toMs(transit + H / 360) };
}
