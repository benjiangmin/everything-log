import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getDocumentName, getMonthEntries, getStartMonth } from "@/lib/journal";
import { MONTH_NAMES, inDoc, monthYear } from "@/lib/journal-years";
import JournalMonthPicker from "@/components/journal/JournalMonthPicker";
import JournalSearch from "@/components/journal/JournalSearch";
import JournalWorkspace from "@/components/journal/JournalWorkspace";
import StickyTop from "@/components/ui/StickyTop";
import YearSetting from "@/components/journal/YearSetting";
import { localNow } from "@/lib/month";

// One unsuspicious document = one year of journaling. Every year uses this same page (/journal/2026).
export default function JournalYearPage({ params, searchParams }: PageProps<"/journal/[year]">) {
  return (
    // At least one screen tall. On wide screens the two sides fill the leftover space and each
    // scrolls inside itself.
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pb-6 pt-8 sm:pt-10">
      <Link href="/" className="mb-4 inline-block self-start text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
        ← Home
      </Link>
      <Suspense fallback={<Skeleton />}>
        {Promise.all([params, searchParams]).then(([p, sp]) => (
          <YearDocument year={p.year} m={sp.m} focus={sp.focus} />
        ))}
      </Suspense>
    </main>
  );
}

async function YearDocument({ year: raw, m, focus }: { year: string; m?: string | string[]; focus?: string | string[] }) {
  if (!/^\d{4}$/.test(raw)) notFound();
  await connection(); // always fresh
  const year = Number(raw);
  const start = await getStartMonth(year); // 1 = Jan–Dec, 9 = school year (Sep–Aug)

  // Which month: from the link, else this month (if today is inside this document), else its first month.
  const now = localNow();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const asked = Number(Array.isArray(m) ? m[0] : m);
  const month = asked >= 1 && asked <= 12 ? asked : inDoc(todayKey, year, start) ? now.getMonth() + 1 : start;
  const calendarYear = monthYear(year, start, month);

  const [name, entries] = await Promise.all([getDocumentName(year), getMonthEntries(calendarYear, month)]);

  return (
    <>
      {/* Pinned to the top while you scroll: the title bar + search. z-40 keeps the month picker and
          search results above everything. */}
      <StickyTop className="sticky top-0 z-40 -mx-4 -mt-3 shrink-0 bg-paper px-4 pb-2 pt-3">
        {/* Title bar: the document's name (from its card on the home page) + the month switcher. */}
        <header className="relative z-40 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-card bg-accent px-4 py-3 text-accent-ink shadow-lg shadow-ink/15 sm:px-5">
          <h1 className="min-w-0 truncate font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            {name ?? "Unsuspicious document"}
          </h1>
          <JournalMonthPicker year={year} start={start} month={month} />
        </header>

        {/* The document's year in its own box (click it to change when the year starts), next to search. */}
        <div className="relative z-30 flex shrink-0 items-start gap-2">
          <YearSetting year={year} start={start} />
          <div className="min-w-0 flex-1">
            <JournalSearch year={year} />
          </div>
        </div>
      </StickyTop>

      <JournalWorkspace
        key={`${year}-${start}`}
        year={year}
        start={start}
        month={month}
        calendarYear={calendarYear}
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
