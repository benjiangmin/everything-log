import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import BackLink from "@/components/ui/BackLink";
import { getDay, mbmTz } from "@/mbm/data";
import { mbmReady, mbmUser } from "@/mbm/supabase";
import { dayKeyOf, dayTitle, isDayKey, shiftDay } from "@/mbm/time";
import DayView from "@/mbm/components/DayView";
import { signOut } from "./actions";

export const metadata = { title: "Minute by Minute" };

// Minute by Minute: every minute of a day, midnight to midnight. ?day=YYYY-MM-DD for another day.
export default function MbmPage(props: PageProps<"/mbm">) {
  return (
    // Wide: the day bar gets about 90% of the screen.
    <main className="mx-auto w-full px-4 pb-24 pt-8 sm:w-[92%] sm:px-0 sm:pt-10">
      {/* The "Day" screen starts here (the page snaps between it and the map). */}
      <div data-screen="day" className="snap-start scroll-mt-10">
        <BackLink className="mb-4 inline-block text-sm text-muted underline-offset-4 hover:text-ink hover:underline" />
      </div>
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
  if (!user) redirect(`/mbm/login?next=${encodeURIComponent(asked ? `/mbm?day=${asked}` : "/mbm")}`);

  const tz = mbmTz();
  const today = dayKeyOf(new Date(), tz);
  const dayKey = isDayKey(asked) && asked <= today ? asked : today;
  const isToday = dayKey === today;

  const day = await getDay(dayKey).catch((e: Error) => e);
  if (day instanceof Error) return <p className="rounded-card bg-surface px-5 py-4 text-sm text-danger">{day.message}</p>;

  const arrow = "grid size-10 place-items-center rounded-control transition-colors hover:bg-accent-ink/10";
  return (
    <>
      <header className="mb-5 flex items-center gap-3 rounded-card bg-accent px-5 py-4 text-accent-ink shadow-lg shadow-ink/15">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Minute by Minute</h1>
          <p className="text-sm opacity-70">{isToday ? `Today · ${dayTitle(dayKey)}` : dayTitle(dayKey)}</p>
        </div>
        <form action={signOut} className="hidden sm:block">
          <button type="submit" title={`Signed in as ${user.email ?? "you"}`} className="rounded-control px-3 py-2 text-sm opacity-70 transition hover:bg-accent-ink/10 hover:opacity-100">
            Sign out
          </button>
        </form>
        <nav aria-label="Days" className="flex items-center gap-1">
          <Link href={`/mbm?day=${shiftDay(dayKey, -1)}`} aria-label="The day before" className={arrow}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          {!isToday && (
            <Link href="/mbm" className="rounded-control px-3 py-2 text-sm font-semibold transition-colors hover:bg-accent-ink/10">
              Today
            </Link>
          )}
          <Link
            href={`/mbm?day=${shiftDay(dayKey, 1)}`}
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
