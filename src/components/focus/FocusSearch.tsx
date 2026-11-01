"use client";

import SearchBox, { Highlight } from "@/components/ui/SearchBox";
import type { FocusHit } from "@/lib/focus";

function shortDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Search this record's logs and notes. Picking one opens its focus area and flashes the day.
export default function FocusSearch({ recordId }: { recordId: string }) {
  return (
    <SearchBox<FocusHit>
      endpoint={`/api/focus/search?record=${recordId}`}
      placeholder="Search the logs"
      label="Search the logs"
      groupOf={(h) => h.area}
      hrefFor={(h) => `/focus/${recordId}?focus=${h.id}`}
      renderHit={(h, q) => {
        const inLog = h.log.toLowerCase().includes(q.toLowerCase());
        return (
          <>
            <span className="num w-16 shrink-0 text-sm text-muted">{shortDate(h.entry_date)}</span>
            <span className="min-w-0 flex-1 truncate">
              <Highlight text={inLog || !h.notes ? h.log : h.notes} query={q} />
            </span>
          </>
        );
      }}
    />
  );
}
