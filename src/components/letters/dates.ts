// "2023-03-06" → "Mar 6, 2023"
export function longDate(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// A year after `key` (the default arrival date for a new letter).
export function yearAfter(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return `${y + 1}-${String(m).padStart(2, "0")}-${String(m === 2 && d === 29 ? 28 : d).padStart(2, "0")}`;
}
