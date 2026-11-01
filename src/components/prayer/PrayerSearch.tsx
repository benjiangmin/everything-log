"use client";

import SearchBox, { Highlight } from "@/components/ui/SearchBox";
import type { PrayerHit } from "@/lib/prayers";

function shortDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function PrayerSearch() {
  return (
    <SearchBox<PrayerHit>
      endpoint="/api/prayer/search"
      placeholder="Search prayers"
      label="Search prayers"
      hrefFor={(p) => `/prayer?focus=${p.id}`}
      renderHit={(p, q) => (
        <>
          <span className="num w-28 shrink-0 text-sm text-muted">{p.prayed_on ? shortDate(p.prayed_on) : "No date"}</span>
          <span className="min-w-0 flex-1 truncate">
            {p.title && (
              <span className="font-semibold">
                <Highlight text={p.title} query={q} />
              </span>
            )}
            <span className="ml-2 text-muted">
              <Highlight text={p.snippet} query={q} />
            </span>
          </span>
        </>
      )}
    />
  );
}
