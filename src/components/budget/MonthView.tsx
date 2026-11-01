import Link from "next/link";
import { connection } from "next/server";
import { getCategories, getEntriesForMonth } from "@/lib/budget";
import {
  currentMonthKey,
  formatMoney,
  monthLabel,
  parseMonthKey,
  shiftMonth,
} from "@/lib/month";
import AddEntryForm from "./AddEntryForm";
import CategoryBreakdown from "./CategoryBreakdown";
import EntryList from "./EntryList";
import MonthPicker from "@/components/ui/MonthPicker";
import SearchBar from "./SearchBar";
import StickyTop from "@/components/ui/StickyTop";

export default async function MonthView({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection(); // always render per request (needs today's date + fresh data)
  const params = await searchParams;
  const raw = Array.isArray(params.m) ? params.m[0] : params.m;
  const thisMonth = currentMonthKey();
  const monthKey = parseMonthKey(raw) ?? thisMonth;
  // Set when you pick a search result: that expense gets scrolled to and highlighted.
  const focusId = typeof params.focus === "string" ? params.focus : undefined;

  const [categories, entries] = await Promise.all([
    getCategories(),
    getEntriesForMonth(monthKey),
  ]);

  const totals = new Map<number, number>();
  for (const e of entries) {
    totals.set(e.category_id, (totals.get(e.category_id) ?? 0) + e.amount);
  }
  const total = entries.reduce((sum, e) => sum + e.amount, 0);
  const rows = categories
    .map((c) => ({ ...c, spent: totals.get(c.id) ?? 0 }))
    .filter((c) => c.spent > 0)
    .sort((a, b) => b.spent - a.spent);

  const { month } = monthLabel(monthKey);
  const prev = shiftMonth(monthKey, -1);
  const next = shiftMonth(monthKey, 1);
  const isThisMonth = monthKey === thisMonth;

  return (
    <>
      {/* Sticky espresso bar + search: stay pinned to the top while you scroll.
          The outer strip covers the page behind it so content doesn't peek out above. */}
      <StickyTop className="sticky top-0 z-30 -mx-4 -mt-3 shrink-0 bg-paper px-4 pb-2 pt-3">
      <header className="flex items-center justify-between gap-4 rounded-card bg-accent px-3 py-2.5 text-accent-ink shadow-lg shadow-ink/15">
        <MonthArrow href={`/budget?m=${prev}`} label={`Show ${monthLabel(prev).month}`} dir="prev" />
        <div className="text-center">
          <h1>
            <MonthPicker monthKey={monthKey} label={month} />
          </h1>
          {!isThisMonth && (
            <Link href="/budget" className="text-sm opacity-70 underline-offset-4 hover:underline hover:opacity-100">
              Jump to current month
            </Link>
          )}
        </div>
        <MonthArrow href={`/budget?m=${next}`} label={`Show ${monthLabel(next).month}`} dir="next" />
      </header>
      <SearchBar />
      </StickyTop>

      {/* The running total, then (on its own line) the add box, which sticks under the month bar. */}
      <section aria-label="Spending this month" className="mt-7">
          <p className="text-sm text-muted">Spent</p>
          <p className="num font-display text-6xl font-semibold leading-none tracking-tight sm:text-7xl">
            {formatMoney(total)}
          </p>

          {rows.length > 0 ? (
            <CategoryBreakdown rows={rows} total={total} monthKey={monthKey} />
          ) : (
            <p className="mt-6 rounded-card border border-dashed border-line px-5 py-6 text-muted">
              Nothing logged for {month} yet. Add your first expense.
            </p>
          )}
      </section>

      <AddEntryForm categories={categories} monthKey={monthKey} isThisMonth={isThisMonth} />

      <EntryList entries={entries} categories={categories} focusId={focusId} monthName={month} />
    </>
  );
}

function MonthArrow({ href, label, dir }: { href: string; label: string; dir: "prev" | "next" }) {
  return (
    <Link
      href={href}
      aria-label={label}
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
