import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { mbmTz } from "@/mbm/data";
import { mbmReady, mbmUser } from "@/mbm/supabase";
import { isDayKey } from "@/mbm/time";
import { getPins, getStats, isRange, periodOf, todayKey, type Range } from "@/mbm/stats";
import StatsView from "@/mbm/components/StatsView";
import RangeRail, { RANGE_COLOR } from "@/mbm/components/RangeRail";

export const metadata = { title: "Stats" };

// Stats: a day, week, month or year at a time. ?range=day|week|month|year&day=YYYY-MM-DD (any
// day in it; default: now).
export default function MbmStatsPage(props: PageProps<"/mbm/stats">) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:pt-8">
      <Suspense fallback={<div aria-busy="true" className="h-96 animate-pulse rounded-card bg-line" />}>
        {props.searchParams.then((sp) => (
          <StatsFor
            range={isRange(sp.range) ? sp.range : "day"}
            day={typeof sp.day === "string" ? sp.day : undefined}
            q={typeof sp.q === "string" ? sp.q.slice(0, 60) : ""}
          />
        ))}
      </Suspense>
    </main>
  );
}

const href = (range: Range, day?: string) => `/mbm/stats?range=${range}${day ? `&day=${day}` : ""}`;

async function StatsFor({ range, day: asked, q }: { range: Range; day?: string; q: string }) {
  await connection();
  if (!mbmReady()) return <p className="rounded-card bg-surface px-5 py-4 text-sm">Minute by Minute isn&apos;t connected yet.</p>;
  const user = await mbmUser();
  if (!user) redirect(`/mbm/login?next=${encodeURIComponent(href(range, asked))}`);

  const tz = mbmTz();
  const today = todayKey(tz);
  const dayKey = isDayKey(asked) && asked <= today ? asked : today;
  const period = periodOf(range, dayKey, today);
  const [stats, pins] = await Promise.all([getStats(period, tz).catch((e: Error) => e), getPins().catch(() => null)]);
  const isNow = period.first <= today && today < period.next;
  const arrow = "grid size-10 place-items-center rounded-control transition-colors hover:bg-surface";

  return (
    <div className="grid gap-6 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-10">
      {/* Day / Week / Month / Year, down the side (keeps the day you're on). */}
      <aside>
        <RangeRail range={range} hrefFor={(r) => href(r, asked)} />
      </aside>
      <div className="min-w-0">
      {/* Which day / week / month / year this is: stays at the top as you scroll. */}
      <div className="sticky top-16 z-20 -mx-2 bg-paper/95 px-2 pb-3 pt-3 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold capitalize" style={{ color: RANGE_COLOR[range] }}>
          <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: RANGE_COLOR[range] }} />
          {range}
        </p>
        <div className="flex items-center gap-1">
          <Link href={href(range, period.prev)} aria-label={`The ${range} before`} className={arrow}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          {!isNow && (
            <Link href={href(range)} className="rounded-control px-3 py-2 text-sm font-semibold transition-colors hover:bg-surface">
              {range === "day" ? "Today" : `This ${range}`}
            </Link>
          )}
          <Link
            href={period.after ? href(range, period.after) : "#"}
            aria-label={`The ${range} after`}
            aria-disabled={!period.after}
            className={`${arrow} ${period.after ? "" : "pointer-events-none opacity-30"}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </div>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{period.title}</h1>
      </div>
      {stats instanceof Error ? (
        <p className="mt-6 rounded-card bg-surface px-5 py-4 text-sm text-danger">{stats.message}</p>
      ) : (
        <StatsView key={`${period.first}-${range}-${q}`} stats={stats} range={range} tz={tz} dayKey={period.first} isNow={isNow} query={q} pins={pins} />
      )}
      </div>
    </div>
  );
}
