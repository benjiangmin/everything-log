import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { getPersonItems } from "@/lib/person";
import StickyTop from "@/components/ui/StickyTop";
import PersonForm from "@/components/person/PersonForm";
import PersonList from "@/components/person/PersonList";
import PersonSearch from "@/components/person/PersonSearch";

// The person: things I look for in a partner. A simple list like Regrets, oldest first. The pinned
// ones show on top; the rest fold away behind "Expand for more details".
export default function PersonPage(props: PageProps<"/person">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-4 pt-8 sm:pt-10">
      <Link href="/" className="mb-4 inline-block self-start text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
        ← Home
      </Link>
      <Suspense fallback={<Skeleton />}>
        {props.searchParams.then((sp) => (
          <Person focus={typeof sp.focus === "string" ? sp.focus : undefined} />
        ))}
      </Suspense>
    </main>
  );
}

async function Person({ focus }: { focus?: string }) {
  await connection(); // always fresh
  const items = await getPersonItems();

  return (
    <>
      {/* Pinned to the top while you scroll: the title + search. The add box scrolls away. */}
      <StickyTop className="sticky top-0 z-30 -mx-4 -mt-3 shrink-0 bg-paper px-4 pb-2 pt-3">
        <header className="flex items-baseline justify-between gap-4 rounded-card bg-accent px-5 py-4 text-accent-ink shadow-lg shadow-ink/15">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">The person</h1>
            <p className="text-sm opacity-70">Things I look for in a partner</p>
          </div>
          <p className="shrink-0 text-sm opacity-70">
            {items.length} {items.length === 1 ? "thing" : "things"}
          </p>
        </header>
        <PersonSearch />
      </StickyTop>

      {/* The add box. */}
      <div className="relative z-20 mt-1 shrink-0 rounded-card bg-line/70 p-3 shadow-md shadow-ink/10 ring-1 ring-accent/25 sm:p-4">
        <PersonForm />
      </div>

      <PersonList items={items} focusId={focus} />
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
