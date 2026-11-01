"use client";

import SearchBox, { Highlight } from "@/components/ui/SearchBox";
import type { PersonItem } from "@/lib/person";

export default function PersonSearch() {
  return (
    <SearchBox<PersonItem>
      endpoint="/api/person/search"
      placeholder="Search the list"
      label="Search the list"
      hrefFor={(t) => `/person?focus=${t.id}`}
      renderHit={(t, q) => (
        <span className="min-w-0 flex-1 truncate">
          <Highlight text={t.body} query={q} />
        </span>
      )}
    />
  );
}
