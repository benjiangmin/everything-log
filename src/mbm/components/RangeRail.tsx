import Link from "next/link";
import type { Range } from "@/mbm/stats";

// Stats' Day / Week / Month / Year, as four big stacked tiles down the side (a row on phones),
// each with its own colour and a little picture of its size: one block, a week of bars, a
// month of days, a year of months. The one you're on is filled in, so it's plain what you're
// looking at.
export const RANGE_COLOR: Record<Range, string> = { day: "#c27a46", week: "#6c8757", month: "#587394", year: "#86658a" };
const NOTE: Record<Range, string> = { day: "One day, hour by hour", week: "Seven days side by side", month: "Every day this month", year: "Twelve months" };

export default function RangeRail({ range, hrefFor }: { range: Range; hrefFor: (r: Range) => string }) {
  return (
    <nav aria-label="Range" className="grid grid-cols-4 gap-2 lg:sticky lg:top-24 lg:grid-cols-1 lg:gap-3">
      {(["day", "week", "month", "year"] as const).map((r) => {
        const on = r === range;
        const c = RANGE_COLOR[r];
        return (
          <Link
            key={r}
            href={hrefFor(r)}
            aria-current={on ? "page" : undefined}
            className={`group relative flex flex-col justify-between overflow-hidden rounded-[20px] p-3 transition-[transform,background-color,box-shadow] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 lg:min-h-[7.5rem] lg:p-5 ${
              on ? "text-[#fbf6ef] shadow-lg" : "hover:-translate-y-0.5"
            }`}
            style={on ? { background: c, boxShadow: `0 12px 28px -12px ${c}` } : { background: `${c}1a`, color: c, outlineColor: c }}
          >
            <Glyph range={r} color={on ? "#fbf6ef" : c} />
            <div className="mt-3 lg:mt-5">
              <p className="font-display text-lg font-semibold capitalize leading-none lg:text-3xl">{r}</p>
              <p className={`mt-1.5 hidden text-sm lg:block ${on ? "text-[#fbf6ef]/80" : "opacity-80"}`}>{NOTE[r]}</p>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}

function Glyph({ range, color }: { range: Range; color: string }) {
  const common = { width: 56, height: 22, viewBox: "0 0 56 22", "aria-hidden": true, className: "h-4 w-auto self-start lg:h-[22px]" } as const;
  if (range === "day") return <svg {...common}><rect x="0" y="4" width="34" height="14" rx="4" fill={color} /></svg>;
  if (range === "week")
    return (
      <svg {...common}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <rect key={i} x={i * 8} y={4} width="5.5" height="14" rx="2" fill={color} opacity={0.45 + (i % 3) * 0.2} />
        ))}
      </svg>
    );
  if (range === "month")
    return (
      <svg {...common}>
        {Array.from({ length: 28 }, (_, i) => (
          <circle key={i} cx={2.5 + (i % 7) * 7.5} cy={2.5 + Math.floor(i / 7) * 5.6} r="1.9" fill={color} opacity={i === 17 ? 1 : 0.55} />
        ))}
      </svg>
    );
  const h = [8, 11, 14, 12, 16, 19, 18, 15, 13, 17, 11, 9];
  return (
    <svg {...common}>
      {h.map((v, i) => (
        <rect key={i} x={i * 4.7} y={22 - v} width="3.2" height={v} rx="1.2" fill={color} opacity={0.6} />
      ))}
    </svg>
  );
}
