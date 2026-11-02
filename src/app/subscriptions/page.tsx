import { Suspense } from "react";
import { connection } from "next/server";
import { getSubscriptions } from "@/lib/subscriptions";
import { dollars, perMonth } from "@/lib/subscription-dates";
import StickyTop from "@/components/ui/StickyTop";
import BackLink from "@/components/ui/BackLink";
import SubscriptionsWorkspace from "@/components/subscriptions/SubscriptionsWorkspace";

// Subscriptions: add one on the left (folds away sideways), all of them on the right (soonest charge first,
// cancelled ones faded at the bottom).
export default function SubscriptionsPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pb-6 pt-8 sm:pt-10">
      <BackLink className="mb-4 inline-block self-start text-sm text-muted underline-offset-4 hover:text-ink hover:underline" />
      <Suspense fallback={<Skeleton />}>
        <Subscriptions />
      </Suspense>
    </main>
  );
}

async function Subscriptions() {
  await connection(); // always fresh (needs today's date)
  const subs = await getSubscriptions();
  const active = subs.filter((s) => !s.cancelled);
  const monthly = active.reduce((sum, s) => sum + perMonth(s.price, s.cycle), 0);

  return (
    <>
      <StickyTop className="sticky top-0 z-30 -mx-4 -mt-3 shrink-0 bg-paper px-4 pb-2 pt-3">
        <header className="flex items-baseline justify-between gap-4 rounded-card bg-accent px-5 py-4 text-accent-ink shadow-lg shadow-ink/15">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Subscriptions</h1>
          <p className="text-sm opacity-70">
            <span className="num font-semibold opacity-100">{dollars(monthly)}</span> / month
          </p>
        </header>
      </StickyTop>

      {/* Left: the add box (folds sideways). Right: the list. */}
      <SubscriptionsWorkspace subs={subs} />
    </>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="h-16 w-full rounded-card bg-line" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[28rem_1fr]">
        <div className="h-80 rounded-card bg-line" />
        <div className="h-96 rounded-card bg-line" />
      </div>
    </div>
  );
}
