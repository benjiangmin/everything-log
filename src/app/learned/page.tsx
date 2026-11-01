import { Suspense } from "react";
import LearnedView from "@/components/learned/LearnedView";
import BackLink from "@/components/ui/BackLink";

// Something new I've learned: one page, a month at a time. Left: add one. Right: the month's list.
export default function LearnedPage(props: PageProps<"/learned">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pb-6 pt-8 sm:pt-10">
      <BackLink className="mb-4 inline-block self-start text-sm text-muted underline-offset-4 hover:text-ink hover:underline" />
      <Suspense fallback={<Skeleton />}>
        <LearnedView searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="h-16 w-full rounded-card bg-line" />
      <div className="mt-2 h-11 w-full rounded-control bg-line" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[24rem_1fr]">
        <div className="h-72 rounded-card bg-line" />
        <div className="h-96 rounded-card bg-line" />
      </div>
    </div>
  );
}
