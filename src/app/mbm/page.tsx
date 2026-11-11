import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getDay, mbmTz } from "@/mbm/data";
import { mbm, mbmReady, mbmUser } from "@/mbm/supabase";
import { dayKeyOf, dayTitle, isDayKey } from "@/mbm/time";
import MbmHome from "@/mbm/components/MbmHome";
import GoogleCard from "@/mbm/components/GoogleCard";
import { googleStatus } from "@/mbm/google";

export const metadata = { title: "Minute by Minute" };

// Home: what you're doing right now. (Old links to /mbm?day=… go to that day's page.)
export default function MbmHomePage(props: PageProps<"/mbm">) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-10 sm:pt-14">
      <Suspense fallback={<div aria-busy="true" className="h-64 animate-pulse rounded-card bg-line" />}>
        {props.searchParams.then((sp) => (
          <Home day={typeof sp.day === "string" ? sp.day : undefined} google={typeof sp.google === "string" ? sp.google : undefined} />
        ))}
      </Suspense>
    </main>
  );
}

async function Home({ day: asked, google }: { day?: string; google?: string }) {
  await connection(); // always fresh
  if (isDayKey(asked)) redirect(`/mbm/day?day=${asked}`);
  if (!mbmReady()) return <p className="rounded-card bg-surface px-5 py-4 text-sm">Minute by Minute isn&apos;t connected yet.</p>;
  const user = await mbmUser();
  if (!user) redirect("/mbm/login?next=/mbm");

  const tz = mbmTz();
  const today = dayKeyOf(new Date(), tz);
  const day = await getDay(today).catch((e: Error) => e);
  if (day instanceof Error) return <p className="rounded-card bg-surface px-5 py-4 text-sm text-danger">{day.message}</p>;

  return (
    <>
      <p className="text-sm font-semibold uppercase tracking-wider text-muted">{dayTitle(today)}</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight sm:text-5xl">Minute by Minute</h1>
      <MbmHome day={day} renderedAt={day.loadedAt} />
      <GoogleCard status={await googleStatus(await mbm()).catch(() => null)} note={google} />
      <nav aria-label="More" className="mt-8 grid gap-3 sm:grid-cols-2">
        <Link href="/mbm/day" className="rounded-card border border-line px-5 py-4 transition-colors hover:bg-surface">
          <p className="font-semibold">Today&apos;s day →</p>
          <p className="text-sm text-muted">The bar and the map, minute by minute</p>
        </Link>
        <Link href="/mbm/stats" className="rounded-card border border-line px-5 py-4 transition-colors hover:bg-surface">
          <p className="font-semibold">Stats →</p>
          <p className="text-sm text-muted">Your days, weeks, months and years</p>
        </Link>
      </nav>
    </>
  );
}
