import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { getPrayers } from "@/lib/prayers";
import StickyTop from "@/components/ui/StickyTop";
import PrayerForm from "@/components/prayer/PrayerForm";
import PrayerList from "@/components/prayer/PrayerList";
import PrayerSearch from "@/components/prayer/PrayerSearch";

// Prayer: write on the left, every prayer on the right (newest first, folded to its title + date).
export default function PrayerPage(props: PageProps<"/prayer">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pb-6 pt-8 sm:pt-10">
      <Link href="/" className="mb-4 inline-block self-start text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
        ← Home
      </Link>
      <Suspense fallback={<Skeleton />}>
        {props.searchParams.then((sp) => (
          <Prayers focus={typeof sp.focus === "string" ? sp.focus : undefined} />
        ))}
      </Suspense>
    </main>
  );
}

async function Prayers({ focus }: { focus?: string }) {
  await connection(); // always fresh
  const prayers = await getPrayers();

  return (
    <>
      {/* Pinned to the top while you scroll: the title + search. */}
      <StickyTop className="sticky top-0 z-30 -mx-4 -mt-3 shrink-0 bg-paper px-4 pb-2 pt-3">
        <header className="flex items-baseline justify-between gap-4 rounded-card bg-accent px-5 py-4 text-accent-ink shadow-lg shadow-ink/15">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Prayer</h1>
          <p className="text-sm opacity-70">
            {prayers.length} {prayers.length === 1 ? "prayer" : "prayers"}
          </p>
        </header>
        <PrayerSearch />
      </StickyTop>

      {/* Left: the writing box. Right: every prayer, in a box that scrolls inside itself. */}
      <div className="mt-4 flex flex-col gap-6 lg:min-h-[32rem] lg:flex-1 lg:basis-0 lg:flex-row">
        {/* z-[25] keeps the date picker above the list. */}
        <section aria-label="Write a prayer" className="relative z-[25] shrink-0 self-start rounded-card bg-surface p-4 sm:p-5 lg:w-[28rem]">
          <PrayerForm />
        </section>
        <PrayerList prayers={prayers} focusId={focus} />
      </div>
    </>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="h-16 w-full rounded-card bg-line" />
      <div className="mt-2 h-11 w-full rounded-control bg-line" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[28rem_1fr]">
        <div className="h-80 rounded-card bg-line" />
        <div className="h-96 rounded-card bg-line" />
      </div>
    </div>
  );
}
