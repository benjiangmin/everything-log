// Reading and writing times typed in the entry editor (minutes from midnight; see TimeRange).

export function fmt(m: number) {
  const mm = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(mm / 60);
  const min = mm % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(min).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function fmtLength(m: number) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h ? `${h}h ${String(min).padStart(2, "0")}m` : `${min}m`;
}

// "930", "9:30", "9.30", "9:30p", "9 pm", "21:30", "12a", "3" (whichever 3 is nearest `near`), "now".
export function parseTime(raw: string, near: number, now: number | null): number | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return null;
  if (t === "now" || t === "n") return now;
  const m = t.match(/^(\d{1,2})(?:[:.]?(\d{2}))?(a|am|p|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (min > 59 || h > 24) return null;
  const half = m[3]?.[0];
  if (half) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (half === "p" ? 12 : 0);
    return h * 60 + min;
  }
  if (h >= 13 || h === 0 || (m[1].length === 2 && m[1].startsWith("0"))) return (h % 24) * 60 + min + (h === 24 ? 1440 : 0);
  // 1–12 with no am/pm: the one nearest what was there.
  const a = (h % 12) * 60 + min;
  const b = a + 720;
  return Math.abs(a - near) <= Math.abs(b - near) ? a : b;
}

// "45", "45m", "1h", "1h 15m", "1:15", "1.5h", "90 min".
export function parseLength(raw: string): number | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return null;
  let m = t.match(/^(\d+):(\d{2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = t.match(/^(\d+(?:\.\d+)?)h(?:(\d+)m?)?$/);
  if (m) return Math.round(Number(m[1]) * 60) + (m[2] ? Number(m[2]) : 0);
  m = t.match(/^(\d+)(?:m|min|mins|minutes)?$/);
  if (m) return Number(m[1]);
  return null;
}
