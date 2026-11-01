import { Suspense } from "react";
import { connection } from "next/server";
import { getRegrets } from "@/lib/regrets";
import StickyTop from "@/components/ui/StickyTop";
import RegretForm from "@/components/regrets/RegretForm";
import RegretList from "@/components/regrets/RegretList";
import RegretSearch from "@/components/regrets/RegretSearch";
import BackLink from "@/components/ui/BackLink";

// Regrets: a simple list. Title + search pinned, the add box, then one bordered box that
// fills the rest of the screen and scrolls inside itself.
export default function RegretsPage(props: PageProps<"/regrets">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-4 pt-8 sm:pt-10">
      <BackLink className="mb-4 inline-block self-start text-sm text-muted underline-offset-4 hover:text-ink hover:underline" />
      <Suspense fallback={<Skeleton />}>
        {props.searchParams.then((sp) => (
          <Regrets focus={typeof sp.focus === "string" ? sp.focus : undefined} />
        ))}
      </Suspense>
    </main>
  );
}

async function Regrets({ focus }: { focus?: string }) {
  await connection(); // always fresh
  const items = await getRegrets();

  return (
    <>
      {/* Pinned to the top while you scroll: the title + search. The add box scrolls away. */}
      <StickyTop className="sticky top-0 z-30 -mx-4 -mt-3 shrink-0 bg-paper px-4 pb-2 pt-3">
        <header className="flex items-baseline justify-between gap-4 rounded-card bg-accent px-5 py-4 text-accent-ink shadow-lg shadow-ink/15">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Regrets</h1>
          <p className="text-sm opacity-70">
            {items.length} {items.length === 1 ? "regret" : "regrets"}
          </p>
        </header>
        <RegretSearch />
      </StickyTop>

      {/* The add box. */}
      <div className="relative z-20 mt-1 shrink-0 rounded-card bg-line/70 p-3 shadow-md shadow-ink/10 ring-1 ring-accent/25 sm:p-4">
        <RegretForm />
      </div>

      <RegretList items={items} focusId={focus} />
    </>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="h-16 w-full rounded-card bg-line" />
      <div className="mt-3 h-11 w-full rounded-control bg-line" />
      <div className="mt-3 h-16 w-full rounded-card bg-line" />
      <div className="mt-5 h-96 w-full rounded-card bg-line" />
    </div>
  );
}
