// Day math for Minute by Minute. A day runs midnight to midnight in your time zone (not the
// server's, which is UTC on Vercel). Used on both the server and in the browser.

export const DEFAULT_TZ = "America/Chicago";

// How far `tz` is ahead of UTC at that moment, in minutes (Chicago: −360 or −300).
function offsetMinutes(at: Date, tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - at.getTime()) / 60000);
}

// The moment a wall-clock time happens in `tz` (handles daylight saving).
export function zonedTime(dayKey: string, minutesIntoDay: number, tz: string) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d) + minutesIntoDay * 60000;
  let t = wall - offsetMinutes(new Date(wall), tz) * 60000;
  t = wall - offsetMinutes(new Date(t), tz) * 60000; // second pass settles DST edges
  return new Date(t);
}

// The day a moment falls on, as "YYYY-MM-DD".
export function dayKeyOf(at: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function dayRange(dayKey: string, tz: string) {
  return { start: zonedTime(dayKey, 0, tz), end: zonedTime(shiftDay(dayKey, 1), 0, tz) };
}

export function shiftDay(dayKey: string, by: number) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + by));
  return t.toISOString().slice(0, 10);
}

export const isDayKey = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

// "9:05 AM"
export function clock(at: Date | string, tz: string) {
  return new Date(at).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
}

// "HH:MM" (24h) for time inputs
export function hhmm(at: Date | string, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(at));
}

// "1h 05m", "12m", "<1m"
export function span(ms: number) {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "<1m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

// "Wednesday, Nov 4"
export function dayTitle(dayKey: string) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" });
}
