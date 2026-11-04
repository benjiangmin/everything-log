import { Suspense } from "react";
import { connection } from "next/server";
import { getPastLetters, todayKey } from "@/lib/letters";
import StickyTop from "@/components/ui/StickyTop";
import BackLink from "@/components/ui/BackLink";
import LettersWorkspace from "@/components/letters/LettersWorkspace";

// Letters to self: write one on the left (it arrives at 12:00am on the day you pick), past letters
// on the right. New arrivals: the inbox in the sidebar. Letters on the way: the sidebar's sealed
// letters (password). Nothing here says whether any are on the way: they're meant to surprise you.
export default function LettersPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pb-6 pt-8 sm:pt-10">
      <BackLink className="mb-4 inline-block self-start text-sm text-muted underline-offset-4 hover:text-ink hover:underline" />
      <Suspense fallback={<Skeleton />}>
        <Letters />
      </Suspense>
    </main>
  );
}

async function Letters() {
  await connection(); // always fresh (what's arrived depends on today)
  const past = await getPastLetters();
  const today = todayKey();

  return (
    <>
      <StickyTop className="sticky top-0 z-30 -mx-4 -mt-3 shrink-0 bg-paper px-4 pb-2 pt-3">
        <header className="flex items-baseline justify-between gap-4 rounded-card bg-accent px-5 py-4 text-accent-ink shadow-lg shadow-ink/15">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Letters to self</h1>

        </header>
      </StickyTop>

      <LettersWorkspace past={past} today={today} />
    </>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="h-16 w-full rounded-card bg-line" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[30rem_1fr]">
        <div className="h-96 rounded-card bg-line" />
        <div className="h-96 rounded-card bg-line" />
      </div>
    </div>
  );
}
