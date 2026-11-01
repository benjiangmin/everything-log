import { Suspense } from "react";
import GratitudeView from "@/components/gratitude/GratitudeView";
import BackLink from "@/components/ui/BackLink";

export default function GratitudePage(props: PageProps<"/gratitude">) {
  return (
    // At least one screen tall. The entries box fills whatever space is left and scrolls inside
    // itself; on short screens the page scrolls a little instead of the box spilling over.
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 pb-6 pt-8 sm:pt-10">
      <BackLink className="mb-4 inline-block text-sm text-muted underline-offset-4 hover:text-ink hover:underline" />
      <Suspense fallback={<Skeleton />}>
        <GratitudeView searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="h-16 w-full rounded-card bg-line" />
      <div className="mt-6 h-56 w-full rounded-card bg-line" />
    </div>
  );
}
