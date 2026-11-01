"use client";

import SearchBox, { Highlight } from "@/components/ui/SearchBox";
import type { Resolution } from "@/lib/resolutions";

export default function ResolutionSearch() {
  return (
    <SearchBox<Resolution>
      endpoint="/api/resolutions/search"
      placeholder="Search resolutions and reflections"
      label="Search resolutions"
      hrefFor={(r) => `/resolutions?y=${r.year}&focus=${r.id}`}
      renderHit={(r, q) => (
        <>
          <span className="num w-12 shrink-0 text-sm text-muted">{r.year}</span>
          <span className="min-w-0 flex-1 truncate">
            <span className="font-semibold">
              <Highlight text={r.title} query={q} />
            </span>
            {r.reflection && r.reflection.toLowerCase().includes(q.toLowerCase()) && (
              <span className="ml-2 text-muted">
                <Highlight text={r.reflection} query={q} />
              </span>
            )}
          </span>
        </>
      )}
    />
  );
}
