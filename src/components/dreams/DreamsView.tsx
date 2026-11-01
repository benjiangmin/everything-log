import Link from "next/link";
import { connection } from "next/server";
import { getDreamsForYear } from "@/lib/dreams";
import YearPicker from "@/components/ui/YearPicker";
import StickyTop from "@/components/ui/StickyTop";
import DreamForm from "./DreamForm";
import DreamList from "./DreamList";
import DreamSearch from "./DreamSearch";
import { localNow } from "@/lib/month";

export default async function DreamsView({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection(); // always render per request (needs today's date + fresh data)
  const params = await searchParams;
  const raw = Array.isArray(params.y) ? params.y[0] : params.y;
  const thisYear = localNow().getFullYear();
  const year = raw && /^\d{4}$/.test(raw) ? Number(raw) : thisYear;
  const isThisYear = year === thisYear;
  // Set when you pick a search result: that dream gets opened, scrolled to and highlighted.
  const focusId = typeof params.focus === "string" ? params.focus : undefined;

  const days = await getDreamsForYear(year);

  return (
    <>
      {/* Pinned to the top while you scroll: the year bar + search. z-40 keeps the year picker and
          search results above everything. */}
      <StickyTop className="sticky top-0 z-40 -mx-4 -mt-3 shrink-0 bg-paper px-4 pb-2 pt-3">
        {/* Year bar: arrows jump a year, click the year to pick any. */}
        <header className="relative z-40 flex shrink-0 items-center justify-between gap-4 rounded-card bg-accent px-3 py-2.5 text-accent-ink shadow-lg shadow-ink/15">
          <YearArrow year={year - 1} dir="prev" />
          <div className="text-center">
            <h1 className="flex items-center gap-1">
              <span className="hidden font-display text-2xl font-semibold tracking-tight opacity-60 sm:inline sm:text-3xl">
                Dreams
              </span>
              <YearPicker year={year} />
            </h1>
            {!isThisYear && (
              <Link href="/dreams" className="text-sm opacity-70 underline-offset-4 hover:underline hover:opacity-100">
                Jump to this year
              </Link>
            )}
          </div>
          <YearArrow year={year + 1} dir="next" />
        </header>
        <DreamSearch />
      </StickyTop>

      {/* Two columns on wide screens: writing on the left, the list on the right.
          Column widths: the 5fr / 7fr split. On phones they stack.
          min-h-min: if the writing box gets taller than the screen (lots of dreams), the page grows
          and scrolls instead of the box spilling out. */}
      <div className="mt-6 grid gap-6 lg:min-h-min lg:flex-1 lg:basis-0 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* z-[25] keeps the date picker's popup above the list. No overflow/scroll here on purpose:
            a scrolling box would cut the popup off. */}
        <div className="relative z-[25]">
          <section aria-label="New entry" className="rounded-card bg-surface p-5 sm:p-6">
            <DreamForm defaultDate={isThisYear ? undefined : `${year}-01-01`} />
          </section>
        </div>
        <DreamList days={days} year={year} focusId={focusId} />
      </div>
    </>
  );
}

function YearArrow({ year, dir }: { year: number; dir: "prev" | "next" }) {
  return (
    <Link
      href={`/dreams?y=${year}`}
      aria-label={`Show ${year}`}
      className="grid size-11 shrink-0 place-items-center rounded-control border border-accent-ink/20 transition-colors hover:bg-accent-ink/10"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d={dir === "prev" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}
