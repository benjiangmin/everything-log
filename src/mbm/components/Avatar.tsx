// Your picture, or your initial on a colour (picked from your name, so it's always the same).
const COLORS = ["#c27a46", "#6c8757", "#587394", "#86658a", "#9a6a4f", "#4f7d78"];

export default function Avatar({ src, name, email, size = 36 }: { src?: string | null; name?: string | null; email?: string | null; size?: number }) {
  const who = (name || email || "?").trim();
  const initial = who[0]?.toUpperCase() ?? "?";
  const color = COLORS[[...who].reduce((n, c) => n + c.charCodeAt(0), 0) % COLORS.length];
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover ring-1 ring-line" style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full font-display font-semibold text-[#fbf6ef]"
      style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  );
}
