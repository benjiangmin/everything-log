import { localNow } from "@/lib/month";

// "Dec 5, 2024" for an item's details.
export function dayLabel(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Today as "YYYY-MM-DD" (the add box's default date).
export function todayKey() {
  const d = localNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// "32" → "$32"; anything else as written ("<1 (on temu)").
export const showPrice = (p: string) => (/^\d+(\.\d+)?$/.test(p) ? `$${p}` : p);
