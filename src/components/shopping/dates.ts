import { localNow } from "@/lib/month";

// "Wed, Jul 22, 2026" for day headings.
export function dayLabel(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export function todayKey() {
  const d = localNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// "32" → "$32"; anything else as written ("<1 (on temu)").
export const showPrice = (p: string) => (/^\d+(\.\d+)?$/.test(p) ? `$${p}` : p);
