import { Suspense } from "react";
import { connection } from "next/server";
import { getCompliments } from "@/lib/compliments";
import StickyTop from "@/components/ui/StickyTop";
import ComplimentForm from "@/components/compliments/ComplimentForm";
import ComplimentList from "@/components/compliments/ComplimentList";
import ComplimentSearch from "@/components/compliments/ComplimentSearch";
import BackLink from "@/components/ui/BackLink";

// Compliments log: one page, everything on it. The page itself scrolls (no box scrolling).
export default function ComplimentsPage(props: PageProps<"/compliments">) {
  return (
    // At least one screen tall, so the list's box can run to the bottom of the page.
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-4 pt-8 sm:pt-10">
      <BackLink className="mb-4 inline-block text-sm text-muted underline-offset-4 hover:text-ink hover:underline" />
      <Suspense fallback={<Skeleton />}>
        {props.searchParams.then((sp) => (
          <Compliments focus={typeof sp.focus === "string" ? sp.focus : undefined} />
        ))}
      </Suspense>
    </main>
  );
}

async function Compliments({ focus }: { focus?: string }) {
  await connection(); // always fresh
  const items = await getCompliments();

  return (
    <>
      {/* Pinned to the top while you scroll: the title + search. z-30 keeps the search results above
          the list. The add box below scrolls away. */}
      <StickyTop className="sticky top-0 z-30 -mx-4 -mt-3 shrink-0 bg-paper px-4 pb-2 pt-3">
        <header className="rounded-card bg-accent px-5 py-4 text-accent-ink shadow-lg shadow-ink/15">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Compliments</h1>
        </header>
        <ComplimentSearch />
      </StickyTop>

      {/* The add box: a deeper oat with a thin coffee outline + soft shadow, so it stands out.
          z-[25] keeps its date picker above the list (whose pinned year bar is z-20). */}
      <div className="relative z-[25] mt-1 rounded-card bg-line/70 p-3 shadow-md shadow-ink/10 ring-1 ring-accent/25 sm:p-4">
        <ComplimentForm />
      </div>

      <ComplimentList items={items} focusId={focus} />
    </>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="h-16 w-full rounded-card bg-line" />
      <div className="mt-3 h-11 w-full rounded-control bg-line" />
      <div className="mt-3 h-16 w-full rounded-card bg-line" />
      <div className="mt-6 h-96 w-full rounded-card bg-line" />
    </div>
  );
}
