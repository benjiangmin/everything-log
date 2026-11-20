// One big, faint drawing behind a page's title (a pin for Places, a briefcase for Jobs): just
// enough to tell the pages apart at a glance. Decoration only.
export default function PageMark({ kind }: { kind: "places" | "jobs" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="pointer-events-none absolute -right-6 -top-14 -z-10 size-64 rotate-[-8deg] text-accent opacity-[0.07] sm:size-80"
    >
      {kind === "places" ? (
        <>
          <path d="M12 21.5s-7.5-6.6-7.5-12.2a7.5 7.5 0 0 1 15 0c0 5.6-7.5 12.2-7.5 12.2z" stroke="currentColor" strokeWidth="1.1" fill="currentColor" fillOpacity="0.35" />
          <circle cx="12" cy="9.3" r="2.7" stroke="currentColor" strokeWidth="1.1" />
        </>
      ) : (
        <>
          <rect x="3" y="7.5" width="18" height="12.5" rx="2.4" stroke="currentColor" strokeWidth="1.1" fill="currentColor" fillOpacity="0.35" />
          <path d="M8.5 7.5V5.6A1.6 1.6 0 0 1 10.1 4h3.8a1.6 1.6 0 0 1 1.6 1.6v1.9M3 12.5h18M10.5 12.5v1.6h3v-1.6" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}
