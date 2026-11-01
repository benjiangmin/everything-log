import { Suspense } from "react";
import { connection } from "next/server";
import { getBucket } from "@/lib/bucket";
import StickyTop from "@/components/ui/StickyTop";
import BucketBoard from "@/components/bucket/BucketBoard";
import BucketForm from "@/components/bucket/BucketForm";
import BucketSearch from "@/components/bucket/BucketSearch";
import BackLink from "@/components/ui/BackLink";

// Bucket list: title + search pinned, the add box, then Not yet | Done (each folds away, like
// National parks). Click an item for its details.
export default function BucketPage(props: PageProps<"/bucket">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pb-6 pt-8 sm:pt-10">
      <BackLink className="mb-4 inline-block self-start text-sm text-muted underline-offset-4 hover:text-ink hover:underline" />
      <Suspense fallback={<Skeleton />}>
        {props.searchParams.then((sp) => (
          <Bucket focus={typeof sp.focus === "string" ? sp.focus : undefined} />
        ))}
      </Suspense>
    </main>
  );
}

async function Bucket({ focus }: { focus?: string }) {
  await connection(); // always fresh
  const { todo, done } = await getBucket();

  return (
    <>
      <StickyTop className="sticky top-0 z-30 -mx-4 -mt-3 shrink-0 bg-paper px-4 pb-2 pt-3">
        <header className="flex items-baseline justify-between gap-4 rounded-card bg-accent px-5 py-4 text-accent-ink shadow-lg shadow-ink/15">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Bucket list</h1>
          <p className="text-sm opacity-80">
            {done.length} of {done.length + todo.length} done
          </p>
        </header>
        <BucketSearch />
      </StickyTop>

      {/* The add box. */}
      <div className="relative z-20 mt-1 shrink-0 rounded-card bg-line/70 p-3 shadow-md shadow-ink/10 ring-1 ring-accent/25 sm:p-4">
        <BucketForm />
      </div>

      <BucketBoard todo={todo} done={done} focusId={focus} />
    </>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="h-16 w-full rounded-card bg-line" />
      <div className="mt-2 h-11 w-full rounded-control bg-line" />
      <div className="mt-3 h-16 w-full rounded-card bg-line" />
      <div className="mt-5 h-96 w-full rounded-card bg-line" />
    </div>
  );
}
