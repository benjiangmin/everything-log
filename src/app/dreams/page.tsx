import { Suspense } from "react";
import DreamsView from "@/components/dreams/DreamsView";
import BackLink from "@/components/ui/BackLink";

// Dream log. Wider than the other pages: writing on the left, the year's dreams on the right.
export default function DreamsPage(props: PageProps<"/dreams">) {
  return (
    // At least one screen tall. On wide screens the two columns fill the leftover space and each
    // scrolls inside itself; on short screens the page scrolls a little instead of squashing them.
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pb-6 pt-8 sm:pt-10">
      <BackLink className="mb-4 inline-block self-start text-sm text-muted underline-offset-4 hover:text-ink hover:underline" />
      <Suspense fallback={<Skeleton />}>
        <DreamsView searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="h-16 w-full rounded-card bg-line" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[5fr_7fr]">
        <div className="h-72 rounded-card bg-line" />
        <div className="h-96 rounded-card bg-line" />
      </div>
    </div>
  );
}
