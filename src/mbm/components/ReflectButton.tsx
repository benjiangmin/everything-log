"use client";

import Link from "next/link";
import { atLabel, useReflectOpen } from "@/mbm/reflectAt";

// Stats → a day: play that day back on Reflect. Any day before today, any time; today, once
// Reflect opens in the evening (greyed out until then).
export default function ReflectButton({ dayKey, today }: { dayKey: string; today: boolean }) {
  const { open, at } = useReflectOpen();
  const moon = (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-[#d4a373]">
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    </svg>
  );
  const look = "flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold";
  if (today && !open) {
    return (
      <span aria-disabled="true" title={`Reflect opens at ${atLabel(at)}`} className={`${look} cursor-not-allowed bg-surface text-muted opacity-60`}>
        {moon}
        Reflect at {atLabel(at)}
      </span>
    );
  }
  return (
    <Link href={`/reflect?day=${dayKey}`} className={`${look} bg-accent text-accent-ink shadow-lg shadow-accent/20 transition-transform hover:scale-[1.03] active:scale-[0.98]`}>
      {moon}
      Reflect on this day
    </Link>
  );
}
