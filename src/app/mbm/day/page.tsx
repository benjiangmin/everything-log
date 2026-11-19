import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getDay, mbmTz } from "@/mbm/data";
import { mbm, mbmReady, mbmUser } from "@/mbm/supabase";
import { eventsBetween, placeFor } from "@/mbm/plans";
import type { DayPlan } from "@/mbm/components/DayBar";
import { dayKeyOf, dayRange, dayTitle, isDayKey, shiftDay } from "@/mbm/time";
import DayView from "@/mbm/components/DayView";

export const metadata = { title: "Day" };

// The Day page: every minute of a day, midnight to midnight, and where you went (the map, one
// screen down). ?day=YYYY-MM-DD for another day.
export default function MbmDayPage(props: PageProps<"/mbm/day">) {
  return (
    // Wide: the day bar gets about 90% of the screen.
    // Fills the window under the top bar: the day bar, then the map taking the rest.
    <main className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full flex-col px-4 pb-5 pt-4 sm:w-[96%] sm:px-0">
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

  // Today, first: anything due to start for you (plans you've got to, jobs at their places), so
  // it's on the bar below. (043; before it's run, nothing.)
  if (isToday) await (await mbm()).rpc("start_for_you").then(() => null, () => null);
  const [day, plans] = await Promise.all([getDay(dayKey).catch((e: Error) => e), isToday ? upcoming(new Date(), dayKey, tz) : Promise.resolve([])]);
  if (day instanceof Error) return <p className="rounded-card bg-surface px-5 py-4 text-sm text-danger">{day.message}</p>;

  const arrow = "grid size-9 place-items-center rounded-control transition-colors hover:bg-surface";
  return (
    <>
      <DayView
        key={dayKey}
        day={day}
        plans={plans}
        today={isToday}
        renderedAt={day.loadedAt}
        title={isToday ? "Today" : dayTitle(dayKey)}
        subtitle={isToday ? dayTitle(dayKey) : undefined}
        nav={
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
        }
      />
    </>
  );
}

// What's still planned for the rest of today (Google Calendar, and plans made on the Plan tab),
// with where each is, when that's known. (Before 041 / Google is connected: just none.)
async function upcoming(now: Date, dayKey: string, tz: string): Promise<DayPlan[]> {
  try {
    const client = await mbm();
    const { end } = dayRange(dayKey, tz);
    const [events, places] = await Promise.all([eventsBetween(client, now, end), client.from("places").select("name, lat, lng").not("name", "is", null).limit(300)]);
    const mine = (places.data ?? []) as { name: string; lat: number; lng: number }[];
    return events
      // (Started, or skipped: not a plan any more. The entry is what's on the bar.)
      .filter((e) => !e.all_day && !e.started_block && !e.skipped)
      .map((e) => ({ id: e.id, title: e.title, start: +new Date(e.starts_at), end: +new Date(e.ends_at), location: e.location, at: placeFor(e, mine) }));
  } catch {
    return [];
  }
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
