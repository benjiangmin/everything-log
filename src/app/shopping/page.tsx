import { Suspense } from "react";
import { connection } from "next/server";
import { getShopping } from "@/lib/shopping";
import StickyTop from "@/components/ui/StickyTop";
import ShoppingBoard from "@/components/shopping/ShoppingBoard";
import ShoppingForm from "@/components/shopping/ShoppingForm";
import ShoppingSearch from "@/components/shopping/ShoppingSearch";
import BackLink from "@/components/ui/BackLink";

// Shopping list: title + search pinned, the add box, then "To buy" (left) and "Bought" (right,
// folded away until you open it). On wide screens it fills the screen and each box scrolls inside.
export default function ShoppingPage(props: PageProps<"/shopping">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pb-6 pt-8 sm:pt-10">
      <BackLink className="mb-4 inline-block self-start text-sm text-muted underline-offset-4 hover:text-ink hover:underline" />
      <Suspense fallback={<Skeleton />}>
        {props.searchParams.then((sp) => (
          <Shopping focus={typeof sp.focus === "string" ? sp.focus : undefined} />
        ))}
      </Suspense>
    </main>
  );
}

async function Shopping({ focus }: { focus?: string }) {
  await connection(); // always fresh
  const { toBuy, bought } = await getShopping();

  return (
    <>
      <StickyTop className="sticky top-0 z-30 -mx-4 -mt-3 shrink-0 bg-paper px-4 pb-2 pt-3">
        <header className="flex items-baseline justify-between gap-4 rounded-card bg-accent px-5 py-4 text-accent-ink shadow-lg shadow-ink/15">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Shopping list</h1>
          <p className="text-sm opacity-70">{toBuy.length} to buy</p>
        </header>
        <ShoppingSearch />
      </StickyTop>

      {/* The add box. z-20 keeps its date picker above the lists. */}
      <div className="relative z-20 mt-1 shrink-0 rounded-card bg-line/70 p-3 shadow-md shadow-ink/10 ring-1 ring-accent/25 sm:p-4">
        <ShoppingForm />
      </div>

      <ShoppingBoard toBuy={toBuy} bought={bought} focusId={focus} />
    </>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="h-16 w-full rounded-card bg-line" />
      <div className="mt-2 h-11 w-full rounded-control bg-line" />
      <div className="mt-3 h-24 w-full rounded-card bg-line" />
      <div className="mt-5 h-96 w-full rounded-card bg-line" />
    </div>
  );
}
