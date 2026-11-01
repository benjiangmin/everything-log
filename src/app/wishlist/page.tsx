import { Suspense } from "react";
import { connection } from "next/server";
import { getWishlist } from "@/lib/wishlist";
import StickyTop from "@/components/ui/StickyTop";
import WishBoard from "@/components/wishlist/WishBoard";
import WishForm from "@/components/wishlist/WishForm";
import WishSearch from "@/components/wishlist/WishSearch";
import BackLink from "@/components/ui/BackLink";

// Wishlist: title + search pinned, the add box, then "Want" (left) and "Got it" + "Changed my mind"
// (right, folded away until you open it). On wide screens it fills the screen and each box scrolls inside.
export default function WishlistPage(props: PageProps<"/wishlist">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pb-6 pt-8 sm:pt-10">
      <BackLink className="mb-4 inline-block self-start text-sm text-muted underline-offset-4 hover:text-ink hover:underline" />
      <Suspense fallback={<Skeleton />}>
        {props.searchParams.then((sp) => (
          <Wishlist focus={typeof sp.focus === "string" ? sp.focus : undefined} />
        ))}
      </Suspense>
    </main>
  );
}

async function Wishlist({ focus }: { focus?: string }) {
  await connection(); // always fresh
  const { want, got, dropped } = await getWishlist();

  return (
    <>
      <StickyTop className="sticky top-0 z-30 -mx-4 -mt-3 shrink-0 bg-paper px-4 pb-2 pt-3">
        <header className="flex items-baseline justify-between gap-4 rounded-card bg-accent px-5 py-4 text-accent-ink shadow-lg shadow-ink/15">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Wishlist</h1>
          <p className="text-sm opacity-70">{want.length} wanted</p>
        </header>
        <WishSearch />
      </StickyTop>

      {/* The add box. z-20 keeps its date picker above the lists. */}
      <div className="relative z-20 mt-1 shrink-0 rounded-card bg-line/70 p-3 shadow-md shadow-ink/10 ring-1 ring-accent/25 sm:p-4">
        <WishForm />
      </div>

      <WishBoard want={want} got={got} dropped={dropped} focusId={focus} />
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
