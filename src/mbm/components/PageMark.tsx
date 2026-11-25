import type { ReactNode } from "react";

// One big, faint drawing behind a page's title (a pin for Places, a briefcase for Jobs, a bell
// for Notifications…): just enough to tell the pages apart at a glance. Decoration only. The same
// drawings, small, mark each row of the Settings list (MarkIcon).
export type MarkKind = "places" | "jobs" | "about" | "sharing" | "notifications" | "sign-in" | "reflect" | "data" | "colors" | "settings";

const S = { stroke: "currentColor", strokeWidth: 1.1, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const F = { fill: "currentColor", fillOpacity: 0.35 } as const;

export const DRAWINGS: Record<MarkKind, ReactNode> = {
  places: (
    <>
      <path d="M12 21.5s-7.5-6.6-7.5-12.2a7.5 7.5 0 0 1 15 0c0 5.6-7.5 12.2-7.5 12.2z" {...S} {...F} />
      <circle cx="12" cy="9.3" r="2.7" {...S} />
    </>
  ),
  jobs: (
    <>
      <rect x="3" y="7.5" width="18" height="12.5" rx="2.4" {...S} {...F} />
      <path d="M8.5 7.5V5.6A1.6 1.6 0 0 1 10.1 4h3.8a1.6 1.6 0 0 1 1.6 1.6v1.9M3 12.5h18M10.5 12.5v1.6h3v-1.6" {...S} />
    </>
  ),
  about: (
    <>
      <circle cx="12" cy="8.2" r="4" {...S} {...F} />
      <path d="M4.5 20.5c.8-4 3.8-6.3 7.5-6.3s6.7 2.3 7.5 6.3z" {...S} {...F} />
    </>
  ),
  sharing: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" {...S} {...F} />
      <circle cx="12" cy="12" r="3.2" {...S} />
    </>
  ),
  notifications: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 2H4.4z" {...S} {...F} />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0M12 3.5V5" {...S} />
    </>
  ),
  "sign-in": (
    <>
      <circle cx="8" cy="12" r="4.5" {...S} {...F} />
      <path d="M12.5 12h9M18.5 12v3M21.5 12v2.5" {...S} />
      <circle cx="8" cy="12" r="1.4" {...S} />
    </>
  ),
  reflect: (
    <>
      <path d="M19.5 14.5A8 8 0 1 1 10 4.5a6.5 6.5 0 0 0 9.5 10z" {...S} {...F} />
      <path d="M16.5 4v3M15 5.5h3" {...S} />
    </>
  ),
  data: (
    <>
      <ellipse cx="12" cy="5.8" rx="7.5" ry="2.8" {...S} {...F} />
      <path d="M4.5 5.8v12.4c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V5.8M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" {...S} />
    </>
  ),
  colors: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 1.5-2.1-.6-1.3.3-2.6 1.7-2.6H17a4 4 0 0 0 4-4C21 7 17 3 12 3z" {...S} {...F} />
      <circle cx="7.5" cy="11" r="1.3" {...S} />
      <circle cx="10" cy="7" r="1.3" {...S} />
      <circle cx="14.5" cy="7" r="1.3" {...S} />
    </>
  ),
  settings: (
    <>
      <path
        d="M12 2.8l1.6 2.3 2.7-.7.6 2.8 2.7.9-.7 2.7L21 12l-2.1 1.2.7 2.7-2.7.9-.6 2.8-2.7-.7L12 21.2l-1.6-2.3-2.7.7-.6-2.8-2.7-.9.7-2.7L3 12l2.1-1.2-.7-2.7 2.7-.9.6-2.8 2.7.7z"
        {...S}
        {...F}
      />
      <circle cx="12" cy="12" r="3.2" {...S} />
    </>
  ),
};

// small: kept beside the title (Settings' pages, whose first card starts right below it and
// would cover a big one).
export default function PageMark({ kind, small = false }: { kind: MarkKind; small?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className={`pointer-events-none absolute -z-10 rotate-[-8deg] text-accent opacity-[0.07] ${small ? "-top-8 right-0 size-36 sm:size-40" : "-right-6 -top-14 size-64 sm:size-80"}`}
    >
      {DRAWINGS[kind]}
    </svg>
  );
}
