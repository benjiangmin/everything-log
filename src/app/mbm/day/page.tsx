import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getDay, mbmTz } from "@/mbm/data";
import { mbmReady, mbmUser } from "@/mbm/supabase";
import { dayKeyOf, dayTitle, isDayKey, shiftDay } from "@/mbm/time";
import DayView from "@/mbm/components/DayView";

export const metadata = { title: "Day" };

// The Day page: every minute of a day, midnight to midnight, and where you went (the map, one
// screen down). ?day=YYYY-MM-DD for another day.
export default function MbmDayPage(props: PageProps<"/mbm/day">) {
  return (
    // Wide: the day bar gets about 90% of the screen.
    // Fills the window under the top bar: the day bar, then the map taking the rest.
    <main className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full flex-col px-4 pb-5 pt-4 sm:w-[92%] sm:px-0">
      <Suspense fallback={<Skeleton />}>
        {props.searchParams.then((sp) => (
          <MbmDay day={typeof sp.day === "string" ? sp.day : undefined} />
        ))}
      </Suspense>
    </main>
  );
}

async function MbmDay({ day: asked }: { day?: string }) {
  await connection(); // always fresh
  if (!mbmReady()) return <NotConnected />;
  const user = await mbmUser();
  if (!user) redirect(`/mbm/login?next=${encodeURIComponent(asked ? `/mbm/day?day=${asked}` : "/mbm/day")}`);

  const tz = mbmTz();
  const today = dayKeyOf(new Date(), tz);
  const dayKey = isDayKey(asked) && asked <= today ? asked : today;
  const isToday = dayKey === today;

  const day = await getDay(dayKey).catch((e: Error) => e);
  if (day instanceof Error) return <p className="rounded-card bg-surface px-5 py-4 text-sm text-danger">{day.message}</p>;

  const arrow = "grid size-9 place-items-center rounded-control transition-colors hover:bg-surface";
  return (
    <>
      <header className="mb-3 flex items-center gap-3">
        <h1 className="min-w-0 flex-1 truncate font-display text-2xl font-semibold tracking-tight">
          {isToday ? "Today" : dayTitle(dayKey)}
          {isToday && <span className="ml-2 text-base font-normal text-muted">{dayTitle(dayKey)}</span>}
        </h1>
        <nav aria-label="Days" className="flex items-center gap-1">
          <Link href={`/mbm/day?day=${shiftDay(dayKey, -1)}`} aria-label="The day before" className={arrow}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          {!isToday && (
            <Link href="/mbm/day" className="rounded-control px-3 py-2 text-sm font-semibold transition-colors hover:bg-surface">
              Today
            </Link>
          )}
          <Link
            href={`/mbm/day?day=${shiftDay(dayKey, 1)}`}
            aria-label="The day after"
            aria-disabled={isToday}
            className={`${arrow} ${isToday ? "pointer-events-none opacity-30" : ""}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </nav>
      </header>

      <DayView key={dayKey} day={day} today={isToday} renderedAt={day.loadedAt} />
    </>
  );
}

function NotConnected() {
  return (
    <div className="rounded-card bg-surface px-5 py-4 text-sm text-ink">
      <p className="font-semibold">Minute by Minute isn&apos;t connected yet.</p>
      <p className="mt-1 text-muted">Add MBM_SUPABASE_URL and MBM_SUPABASE_PUBLISHABLE_KEY (from the minute-by-minute Supabase project) to the environment, then reload.</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="h-20 w-full rounded-card bg-line" />
      <div className="mt-5 h-44 w-full rounded-card bg-line" />
      <div className="mt-5 h-36 w-full rounded-card bg-line" />
    </div>
  );
}
