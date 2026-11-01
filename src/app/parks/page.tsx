import { Suspense } from "react";
import { connection } from "next/server";
import { getParks } from "@/lib/parks";
import StickyTop from "@/components/ui/StickyTop";
import ParksBoard from "@/components/parks/ParksBoard";
import ParkForm from "@/components/parks/ParkForm";
import ParkSearch from "@/components/parks/ParkSearch";
import BackLink from "@/components/ui/BackLink";

// National parks progress: title + search pinned, Visited | Not yet in one box (each folds away),
// and the add box for your own parks underneath.
export default function ParksPage(props: PageProps<"/parks">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pb-6 pt-8 sm:pt-10">
      <BackLink className="mb-4 inline-block self-start text-sm text-muted underline-offset-4 hover:text-ink hover:underline" />
      <Suspense fallback={<Skeleton />}>
        {props.searchParams.then((sp) => (
          <Parks focus={typeof sp.focus === "string" ? sp.focus : undefined} />
        ))}
      </Suspense>
    </main>
  );
}

async function Parks({ focus }: { focus?: string }) {
  await connection(); // always fresh
  const { visited, notYet } = await getParks();
  const officialVisited = visited.filter((p) => !p.custom).length;
  const officialTotal = officialVisited + notYet.filter((p) => !p.custom).length;
  const otherVisited = visited.filter((p) => p.custom).length;

  return (
    <>
      <StickyTop className="sticky top-0 z-30 -mx-4 -mt-3 shrink-0 bg-paper px-4 pb-2 pt-3">
        <header className="flex items-baseline justify-between gap-4 rounded-card bg-accent px-5 py-4 text-accent-ink shadow-lg shadow-ink/15">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">National parks</h1>
          {/* Counts official national parks only; your own parks ("other") are shown apart. */}
          <p className="text-sm">
            <span className="opacity-90">
              {officialVisited} of {officialTotal} visited
            </span>
            {otherVisited > 0 && <span className="ml-2 rounded-full bg-accent-ink/15 px-2 py-0.5 text-xs opacity-80">+{otherVisited} other</span>}
          </p>
        </header>
        <ParkSearch />
      </StickyTop>

      <ParksBoard visited={visited} notYet={notYet} focusId={focus} />

      {/* The add box, under the parks. */}
      <div className="mt-4 shrink-0 rounded-card bg-line/70 p-3 shadow-md shadow-ink/10 ring-1 ring-accent/25 sm:p-4">
        <ParkForm />
      </div>
    </>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="h-16 w-full rounded-card bg-line" />
      <div className="mt-2 h-11 w-full rounded-control bg-line" />
      <div className="mt-5 h-96 w-full rounded-card bg-line" />
      <div className="mt-4 h-24 w-full rounded-card bg-line" />
    </div>
  );
}
