import Link from "next/link";
import { connection } from "next/server";
import { getGratitudeDays, getGratitudeForMonth } from "@/lib/gratitude";
import { currentMonthKey, localNow, monthLabel, parseMonthKey, shiftMonth } from "@/lib/month";
import MonthPicker from "@/components/ui/MonthPicker";
import StickyTop from "@/components/ui/StickyTop";
import GratitudeWorkspace from "./GratitudeWorkspace";
import GratitudeSearch from "./GratitudeSearch";

export default async function GratitudeView({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection(); // always render per request (needs today's date + fresh data)
  const params = await searchParams;
  const raw = Array.isArray(params.m) ? params.m[0] : params.m;
  const thisMonth = currentMonthKey();
  const monthKey = parseMonthKey(raw) ?? thisMonth;
  // Set when you pick a search result: that entry gets scrolled to and highlighted.
  const focusId = typeof params.focus === "string" ? params.focus : undefined;

  // The server's today might be a day off from yours (time zones), so look at the days around it.
  const now = localNow();
  const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const serverToday = dayKey(now);
  const [entries, recentDays] = await Promise.all([
    getGratitudeForMonth(monthKey),
    getGratitudeDays(dayKey(new Date(now.getTime() - 864e5)), dayKey(new Date(now.getTime() + 864e5))),
  ]);

  const { month } = monthLabel(monthKey);
  const prev = shiftMonth(monthKey, -1);
  const next = shiftMonth(monthKey, 1);
  const isThisMonth = monthKey === thisMonth;
  const daysLogged = new Set(entries.map((e) => e.entry_date)).size;

  return (
    <>
      {/* Month bar + search, pinned to the top while you scroll. */}
      <StickyTop className="sticky top-0 z-30 -mx-4 -mt-3 shrink-0 bg-paper px-4 pb-2 pt-3">
        <header className="flex items-center justify-between gap-4 rounded-card bg-accent px-3 py-2.5 text-accent-ink shadow-lg shadow-ink/15">
          <MonthArrow href={`/gratitude?m=${prev}`} label={`Show ${monthLabel(prev).month}`} dir="prev" />
          <div className="text-center">
            <h1>
              <MonthPicker monthKey={monthKey} label={month} />
            </h1>
            {!isThisMonth && (
              <Link
                href="/gratitude"
                className="text-sm opacity-70 underline-offset-4 hover:underline hover:opacity-100"
              >
                Jump to current month
              </Link>
            )}
          </div>
          <MonthArrow href={`/gratitude?m=${next}`} label={`Show ${monthLabel(next).month}`} dir="next" />
        </header>
        <GratitudeSearch />
      </StickyTop>

      {/* Left: the writing box (slides to a slim strip once today's entry is in).
          Right: the month's entries, which widen to fill the space. */}
      <GratitudeWorkspace
        defaultDate={isThisMonth ? undefined : `${monthKey}-01`}
        daysWithEntries={recentDays}
        serverToday={serverToday}
        entries={entries}
        monthName={month}
        daysLogged={daysLogged}
        focusId={focusId}
      />
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
