import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { focusRecordExists, getFocusAreas, getFocusName } from "@/lib/focus";
import StickyTop from "@/components/ui/StickyTop";
import FocusSearch from "@/components/focus/FocusSearch";
import FocusAreaList from "@/components/focus/FocusAreaList";

// One unrecreational record (a semester, a winter break…). Every record uses this same page
// (/focus/<id>): focus areas on the left; the chosen one's logs (one per day) on the right.
export default function FocusPage({ params, searchParams }: PageProps<"/focus/[id]">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pb-6 pt-8 sm:pt-10">
      <Link href="/" className="mb-4 inline-block self-start text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
        ← Home
      </Link>
      <Suspense fallback={<Skeleton />}>
        {Promise.all([params, searchParams]).then(([p, sp]) => (
          <FocusRecord id={p.id} focus={typeof sp.focus === "string" ? sp.focus : undefined} />
        ))}
      </Suspense>
    </main>
  );
}

async function FocusRecord({ id, focus }: { id: string; focus?: string }) {
  await connection(); // always fresh
  if (!(await focusRecordExists(id))) notFound();
  const [name, areas] = await Promise.all([getFocusName(id), getFocusAreas(id)]);

  return (
    <>
      {/* Pinned to the top while you scroll: the title (the card's name) + search. */}
      <StickyTop className="sticky top-0 z-30 -mx-4 -mt-3 shrink-0 bg-paper px-4 pb-2 pt-3">
        <header className="flex items-baseline justify-between gap-4 rounded-card bg-accent px-5 py-4 text-accent-ink shadow-lg shadow-ink/15">
          <h1 className="min-w-0 truncate font-display text-2xl font-semibold tracking-tight sm:text-3xl">{name ?? "Unrecreational record"}</h1>
          <p className="shrink-0 text-sm opacity-70">
            {areas.length} {areas.length === 1 ? "focus area" : "focus areas"}
          </p>
        </header>
        <FocusSearch recordId={id} />
      </StickyTop>

      <FocusAreaList key={id} recordId={id} areas={areas} focusId={focus} />
    </>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="h-16 w-full rounded-card bg-line" />
      <div className="mt-2 h-11 w-full rounded-control bg-line" />
      <div className="mt-3 h-16 w-full rounded-card bg-line" />
      <div className="mt-5 space-y-2">
        <div className="h-16 rounded-card bg-line" />
        <div className="h-16 rounded-card bg-line" />
        <div className="h-16 rounded-card bg-line" />
      </div>
    </div>
  );
}
