import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Suspense } from "react";
import Loading from "@/mbm/components/Loading";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getDay, mbmTz } from "@/mbm/data";
import { mbm, mbmReady, mbmUser } from "@/mbm/supabase";
import { dayKeyOf, dayTitle, isDayKey } from "@/mbm/time";
import MbmHome from "@/mbm/components/MbmHome";
import GoogleCard from "@/mbm/components/GoogleCard";
import PhoneNote from "@/mbm/components/PhoneNote";
import HomeSky from "@/mbm/components/HomeSky";
import { googleStatus } from "@/mbm/google";
import { isEverythingLogOwner } from "@/mbm/owner";

export const metadata = { title: "Minute by Minute" };

// Home: what you're doing right now. (Old links to /mbm?day=… go to that day's page.)
export default function MbmHomePage(props: PageProps<"/mbm">) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-10 sm:pt-14">
      <Suspense fallback={<Loading />}>
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
      {/* Back to your everything-log: only you see it (src/mbm/owner.ts). */}
      {(await isEverythingLogOwner()) && (
        <Link href="/" className="-mt-6 mb-3 inline-block text-sm text-muted transition-colors hover:text-ink sm:-mt-8">
          <span aria-hidden="true">←</span> everything-log
        </Link>
      )}
      {/* The light outside, where you are (your latest stop; Madison until there is one). */}
      <HomeSky
        name={await firstName()}
        tz={tz}
        lat={day.visits.at(-1)?.lat ?? 43.073}
        lng={day.visits.at(-1)?.lng ?? -89.401}
        renderedAt={+new Date(day.loadedAt)}
        dateLabel={dayTitle(today)}
      />
      <PhoneNote phone={await linkedPhone()} now={+new Date(day.loadedAt)} />
      <MbmHome day={day} renderedAt={day.loadedAt} />
      {/* Connecting things lives on the home page until it's done (then: Your account). Just
          connected: shown once more, so you see it worked. */}
      {await (async () => {
        const status = await googleStatus(await mbm()).catch(() => null);
        return !status?.connected || google === "connected" ? <GoogleCard status={status} note={google} /> : null;
      })()}
      <FutureNote client={await mbm()} />
    </>
  );
}

// The phone linked to this account (036_phones.sql), null if none, "unknown" if that's not run.
async function linkedPhone() {
  const { data, error } = await (await mbm()).from("phones").select("name, last_seen").maybeSingle();
  if (error) return "unknown" as const;
  return data as { name: string | null; last_seen: string } | null;
}

// No birthday yet (skipped on the phone, or never asked): a nudge to the Future page.
async function FutureNote({ client }: { client: SupabaseClient }) {
  const { data, error } = await client.from("profiles").select("birthday").maybeSingle();
  if (error || data?.birthday) return null; // (038 not run, or done)
  return (
    <Link href="/mbm/future" className="mt-5 flex items-center gap-4 rounded-card border border-line px-5 py-4 transition-colors hover:bg-surface">
      <span aria-hidden="true" className="text-2xl">⏳</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">See your life on one bar</p>
        <p className="text-sm text-muted">Add your birthday and a few details to see how much is likely ahead, and where it goes.</p>
      </div>
      <span aria-hidden="true" className="text-muted">→</span>
    </Link>
  );
}

// Your name, from About you (038), for the greeting.
async function firstName() {
  const { data } = await (await mbm()).from("profiles").select("name").maybeSingle();
  return (data?.name as string | null | undefined)?.split(" ")[0] ?? null;
}
