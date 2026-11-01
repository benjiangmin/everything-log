import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { getResolutionYear } from "@/lib/resolutions";
import { localNow } from "@/lib/month";
import StickyTop from "@/components/ui/StickyTop";
import YearPicker from "@/components/ui/YearPicker";
import ResolutionForm from "@/components/resolutions/ResolutionForm";
import ResolutionList from "@/components/resolutions/ResolutionList";
import ResolutionSearch from "@/components/resolutions/ResolutionSearch";

// New year's resolutions: one year at a time (‹ year ›). Each resolution has a "how it went"
// written at the end of the year; each year can have a note above its list.
export default function ResolutionsPage(props: PageProps<"/resolutions">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-4 pb-6 pt-8 sm:pt-10">
      <Link href="/" className="mb-4 inline-block self-start text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
        ← Home
      </Link>
      <Suspense fallback={<Skeleton />}>
        {props.searchParams.then((sp) => (
          <Resolutions y={typeof sp.y === "string" ? sp.y : undefined} focus={typeof sp.focus === "string" ? sp.focus : undefined} />
        ))}
      </Suspense>
    </main>
  );
}

async function Resolutions({ y, focus }: { y?: string; focus?: string }) {
  await connection(); // always fresh (and needs today's year)
  const thisYear = localNow().getFullYear();
  const year = y && /^\d{4}$/.test(y) ? Number(y) : thisYear;
  const { items, note, lastYearCount } = await getResolutionYear(year);
  const reflected = items.filter((r) => r.reflection).length;

  return (
    <>
      <StickyTop className="sticky top-0 z-40 -mx-4 -mt-3 shrink-0 bg-paper px-4 pb-2 pt-3">
        {/* Year bar: arrows jump a year, click the year to pick any. */}
        <header className="relative z-40 flex shrink-0 items-center justify-between gap-4 rounded-card bg-accent px-3 py-2.5 text-accent-ink shadow-lg shadow-ink/15">
          <YearArrow year={year - 1} dir="prev" />
          <div className="text-center">
            <h1 className="flex items-center justify-center gap-1">
              <span className="hidden font-display text-2xl font-semibold tracking-tight opacity-60 sm:inline sm:text-3xl">Resolutions</span>
              <YearPicker year={year} />
            </h1>
            <p className="text-sm opacity-80">
              {items.length} {items.length === 1 ? "resolution" : "resolutions"}
              {items.length > 0 && reflected > 0 && ` · ${reflected} looked back on`}
              {year !== thisYear && (
                <>
                  {" · "}
                  <Link href="/resolutions" className="underline-offset-4 hover:underline">
                    Jump to this year
                  </Link>
                </>
              )}
            </p>
          </div>
          <YearArrow year={year + 1} dir="next" />
        </header>
        <ResolutionSearch />
      </StickyTop>

      {/* The add box. */}
      <div className="relative z-20 mt-1 shrink-0 rounded-card bg-line/70 p-3 shadow-md shadow-ink/10 ring-1 ring-accent/25 sm:p-4">
        <ResolutionForm key={year} year={year} />
      </div>

      <ResolutionList key={year} year={year} items={items} note={note} lastYearCount={lastYearCount} focusId={focus} />
    </>
  );
}

function YearArrow({ year, dir }: { year: number; dir: "prev" | "next" }) {
  return (
    <Link
      href={`/resolutions?y=${year}`}
      aria-label={`Show ${year}`}
      className="grid size-11 shrink-0 place-items-center rounded-control border border-accent-ink/20 transition-colors hover:bg-accent-ink/10"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d={dir === "prev" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="h-16 w-full rounded-card bg-line" />
      <div className="mt-2 h-11 w-full rounded-control bg-line" />
      <div className="mt-3 h-16 w-full rounded-card bg-line" />
      <div className="mt-5 h-96 w-full rounded-card bg-line" />
    </div>
  );
}
