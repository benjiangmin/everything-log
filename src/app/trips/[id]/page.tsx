import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getTrip, getTripDays, getTripName } from "@/lib/trips";
import StickyTop from "@/components/ui/StickyTop";
import StartDate from "@/components/trips/StartDate";
import TripSearch from "@/components/trips/TripSearch";
import TripWorkspace from "@/components/trips/TripWorkspace";
import BackLink from "@/components/ui/BackLink";

// One recreational record (a trip / break). Every trip uses this same page (/trips/<id>).
// Like an unsuspicious document: writing box on the left, the days on the right.
export default function TripPage({ params, searchParams }: PageProps<"/trips/[id]">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pb-6 pt-8 sm:pt-10">
      <BackLink className="mb-4 inline-block self-start text-sm text-muted underline-offset-4 hover:text-ink hover:underline" />
      <Suspense fallback={<Skeleton />}>
        {Promise.all([params, searchParams]).then(([p, sp]) => (
          <TripDocument id={p.id} focus={typeof sp.focus === "string" ? sp.focus : undefined} />
        ))}
      </Suspense>
    </main>
  );
}

async function TripDocument({ id, focus }: { id: string; focus?: string }) {
  await connection(); // always fresh
  const trip = await getTrip(id);
  if (!trip) notFound();
  const [name, days] = await Promise.all([getTripName(id), getTripDays(id)]);

  return (
    <>
      {/* Pinned to the top while you scroll: the title (the card's name) + start date + search. */}
      <StickyTop className="sticky top-0 z-40 -mx-4 -mt-3 shrink-0 bg-paper px-4 pb-2 pt-3">
        <header className="relative z-40 flex shrink-0 items-center rounded-card bg-accent px-4 py-3 text-accent-ink shadow-lg shadow-ink/15 sm:px-5">
          <h1 className="min-w-0 truncate py-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            {name ?? "Recreational record"}
          </h1>
        </header>

        {/* The start date (optional) in its own box, next to search. */}
        <div className="relative z-30 flex shrink-0 items-start gap-2">
          <StartDate tripId={trip.id} start={trip.start_date} />
          <div className="min-w-0 flex-1">
            <TripSearch tripId={trip.id} />
          </div>
        </div>
      </StickyTop>

      <TripWorkspace key={trip.id} tripId={trip.id} start={trip.start_date} days={days} focusId={focus} />
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
