import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getBibleMonth, getBibleName, getLastBibleMonth } from "@/lib/bible";
import { MONTH_NAMES } from "@/lib/journal-years";
import JournalMonthPicker from "@/components/journal/JournalMonthPicker";
import StickyTop from "@/components/ui/StickyTop";
import BibleSearch from "@/components/bible/BibleSearch";
import BibleWorkspace from "@/components/bible/BibleWorkspace";
import { localNow } from "@/lib/month";

// Bible in a year: one page per year (/bible/2024), Jan–Dec, shown a month at a time.
// Same layout as the unsuspicious documents.
export default function BibleYearPage({ params, searchParams }: PageProps<"/bible/[year]">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pb-6 pt-8 sm:pt-10">
      <Link href="/" className="mb-4 inline-block self-start text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
        ← Home
      </Link>
      <Suspense fallback={<Skeleton />}>
        {Promise.all([params, searchParams]).then(([p, sp]) => (
          <BibleYear year={p.year} m={sp.m} focus={sp.focus} />
        ))}
      </Suspense>
    </main>
  );
}

async function BibleYear({ year: raw, m, focus }: { year: string; m?: string | string[]; focus?: string | string[] }) {
  if (!/^\d{4}$/.test(raw)) notFound();
  await connection(); // always fresh
  const year = Number(raw);

  // Which month: from the link, else this month (if it's this year), else the year's newest month.
  const now = localNow();
  const asked = Number(Array.isArray(m) ? m[0] : m);
  const month =
    asked >= 1 && asked <= 12 ? asked : now.getFullYear() === year ? now.getMonth() + 1 : ((await getLastBibleMonth(year)) ?? 1);

  const [name, entries] = await Promise.all([getBibleName(year), getBibleMonth(year, month)]);

  return (
    <>
      <StickyTop className="sticky top-0 z-40 -mx-4 -mt-3 shrink-0 bg-paper px-4 pb-2 pt-3">
        <header className="relative z-40 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-card bg-accent px-4 py-3 text-accent-ink shadow-lg shadow-ink/15 sm:px-5">
          <h1 className="min-w-0 truncate font-display text-2xl font-semibold tracking-tight sm:text-3xl">{name ?? "Bible in a year"}</h1>
          <JournalMonthPicker year={year} start={1} month={month} base="/bible" />
        </header>

        {/* The year in its own box, next to search. */}
        <div className="relative z-30 flex shrink-0 items-start gap-2">
          <p className="num mt-2 grid h-[46px] place-items-center whitespace-nowrap rounded-control border border-line bg-surface px-4 font-display text-lg font-semibold">
            {year}
          </p>
          <div className="min-w-0 flex-1">
            <BibleSearch year={year} />
          </div>
        </div>
      </StickyTop>

      <BibleWorkspace
        key={year}
        year={year}
        month={month}
        monthName={MONTH_NAMES[month - 1]}
        entries={entries}
        focusId={typeof focus === "string" ? focus : undefined}
      />
    </>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="h-16 w-full rounded-card bg-line" />
      <div className="mt-2 h-11 w-full rounded-control bg-line" />
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="h-96 rounded-card bg-line" />
        <div className="h-96 rounded-card bg-line" />
      </div>
    </div>
  );
}
