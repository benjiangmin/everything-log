// Shared by the server and the browser (no database code here).

export type Cycle = "monthly" | "yearly";

const pad = (n: number) => String(n).padStart(2, "0");
const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate(); // m is 1-12

// The next charge on or after today. A saved date that has passed rolls forward by months (or
// years) on its own, keeping its day of the month (the 31st becomes the 30th/28th when it must).
export function upcomingCharge(saved: string | null, cycle: Cycle, today: string): string | null {
  if (!saved) return null;
  const [y0, m0, d0] = saved.split("-").map(Number);
  const step = cycle === "yearly" ? 12 : 1;
  for (let i = 0; i < 1200; i += step) {
    const total = m0 - 1 + i;
    const y = y0 + Math.floor(total / 12);
    const m = (total % 12) + 1;
    const key = `${y}-${pad(m)}-${pad(Math.min(d0, daysIn(y, m)))}`;
    if (key >= today) return key;
  }
  return saved;
}

// What it costs per month (a yearly one counts as a twelfth).
export const perMonth = (price: number, cycle: Cycle) => (cycle === "yearly" ? price / 12 : price);

export function shortDate(key: string, withYear = false) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
}

// 1 → "1st", 22 → "22nd", 13 → "13th"
export function ordinal(n: number) {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

// When it bills, from its saved date: "Monthly on the 14th" / "Yearly on Mar 5".
// short: "On the 14th" / "On Mar 5".
export function billedOn(saved: string, cycle: Cycle, short = false) {
  const [, m, d] = saved.split("-").map(Number);
  const when =
    cycle === "yearly"
      ? `on ${new Date(2000, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
      : `on the ${ordinal(d)}`;
  if (short) return when[0].toUpperCase() + when.slice(1);
  return `${cycle === "yearly" ? "Yearly" : "Monthly"} ${when}`;
}

export const dollars = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
