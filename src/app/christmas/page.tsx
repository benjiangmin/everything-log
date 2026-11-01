import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { getChristmasYear } from "@/lib/christmas";
import StickyTop from "@/components/ui/StickyTop";
import YearPicker from "@/components/ui/YearPicker";
import ChristmasSearch from "@/components/christmas/ChristmasSearch";
import GiftForm from "@/components/christmas/GiftForm";
import GiftList from "@/components/christmas/GiftList";
import { money } from "@/components/christmas/money";
import { localNow } from "@/lib/month";

// Christmas list: one year at a time (‹ year ›), gifts grouped by person, with each person's total
// and the year's running total.
export default function ChristmasPage(props: PageProps<"/christmas">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 pb-6 pt-8 sm:pt-10">
      <Link href="/" className="mb-4 inline-block self-start text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
        ← Home
      </Link>
      <Suspense fallback={<Skeleton />}>
        {props.searchParams.then((sp) => (
          <Christmas y={typeof sp.y === "string" ? sp.y : undefined} focus={typeof sp.focus === "string" ? sp.focus : undefined} />
        ))}
      </Suspense>
    </main>
  );
}

async function Christmas({ y, focus }: { y?: string; focus?: string }) {
  await connection(); // always fresh (and needs today's year)
  const thisYear = localNow().getFullYear();
  const year = y && /^\d{4}$/.test(y) ? Number(y) : thisYear;
  const { people, total } = await getChristmasYear(year);
  const names = people.map((p) => p.name);

  return (
    <>
      <StickyTop className="sticky top-0 z-40 -mx-4 -mt-3 shrink-0 bg-paper px-4 pb-2 pt-3">
        {/* Year bar: arrows jump a year, click the year to pick any. The year's total on the right. */}
        <header className="relative z-40 flex shrink-0 items-center justify-between gap-4 rounded-card bg-accent px-3 py-2.5 text-accent-ink shadow-lg shadow-ink/15">
          <YearArrow year={year - 1} dir="prev" />
          <div className="text-center">
            <h1 className="flex items-center justify-center gap-1">
              <span className="hidden font-display text-2xl font-semibold tracking-tight opacity-60 sm:inline sm:text-3xl">Christmas list</span>
              <YearPicker year={year} />
            </h1>
            <p className="text-sm opacity-80">
              Total <span className="num font-semibold">{money(total)}</span>
              {year !== thisYear && (
                <>
                  {" · "}
                  <Link href="/christmas" className="underline-offset-4 hover:underline">
                    Jump to this year
                  </Link>
                </>
              )}
            </p>
          </div>
          <YearArrow year={year + 1} dir="next" />
        </header>
        <ChristmasSearch />
      </StickyTop>

      {/* The add box. z-20 keeps the name dropdown above the list. */}
      <div className="relative z-20 mt-1 shrink-0 rounded-card bg-line/70 p-3 shadow-md shadow-ink/10 ring-1 ring-accent/25 sm:p-4">
        <GiftForm key={year} year={year} names={names} />
      </div>

      <GiftList year={year} people={people} names={names} focusId={focus} />
    </>
  );
}

function YearArrow({ year, dir }: { year: number; dir: "prev" | "next" }) {
  return (
    <Link
      href={`/christmas?y=${year}`}
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
      <div className="mt-3 h-24 w-full rounded-card bg-line" />
      <div className="mt-5 h-96 w-full rounded-card bg-line" />
    </div>
  );
}
