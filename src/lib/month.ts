// Months are passed around as "YYYY-MM" strings, e.g. "2026-10".

// Your time zone. The server runs on UTC (it's already tomorrow there from 7pm Chicago time), so
// anything the server works out about "today" / "this month" / "this year" uses this instead.
// To change it, set NEXT_PUBLIC_TIME_ZONE (e.g. "America/New_York") in .env.local and on the host.
export const TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE || "America/Chicago";

// "Now" as a plain Date whose year/month/day/hours read as your local time.
// In the browser that's just the computer's clock; on the server it's converted to TIME_ZONE.
export function localNow(): Date {
  const now = new Date();
  if (typeof window !== "undefined") return now;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, Number(p.value)]),
  );
  return new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
}

export function currentMonthKey(now = localNow()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function parseMonthKey(value: string | undefined): string | null {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  return value;
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return currentMonthKey(d);
}

// First day of the month and first day of the next month, as YYYY-MM-DD.
export function monthRange(key: string): { start: string; end: string } {
  return { start: `${key}-01`, end: `${shiftMonth(key, 1)}-01` };
}

export function monthLabel(key: string): { month: string; year: string } {
  const [y, m] = key.split("-").map(Number);
  const month = new Date(y, m - 1, 1).toLocaleString("en-US", {
    month: "long",
  });
  return { month, year: String(y) };
}

export function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
