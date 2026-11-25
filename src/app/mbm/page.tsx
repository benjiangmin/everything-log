import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Suspense, type ReactNode } from "react";
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
  if (isDayKey(asked)) redirect(`/day?day=${asked}`);
  if (!mbmReady()) return <p className="rounded-card bg-surface px-5 py-4 text-sm">Minute by Minute isn&apos;t connected yet.</p>;
  const user = await mbmUser();
  if (!user) return <Landing />; // (signed out: what this is, publicly, for Google and anyone new)
  // A new account that hasn't been through the setup yet (no About you saved): the setup first.
  {
    const { data, error } = await (await mbm()).from("profiles").select("user_id").maybeSingle();
    if (!error && !data) redirect("/setup");
  }

  const tz = mbmTz();
  const today = dayKeyOf(new Date(), tz);
  const day = await getDay(today).catch((e: Error) => e);
  if (day instanceof Error) return <p className="rounded-card bg-surface px-5 py-4 text-sm text-danger">{day.message}</p>;

  return (
    <>
      {/* Back to your everything-log: only you see it (src/mbm/owner.ts). */}
      {(await isEverythingLogOwner()) && (
        <Link href="https://www.benbadobee.com/" className="-mt-6 mb-3 inline-block text-sm text-muted transition-colors hover:text-ink sm:-mt-8">
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
    <Link href="/future" className="mt-5 flex items-center gap-4 rounded-card border border-line px-5 py-4 transition-colors hover:bg-surface">
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

// The public front page (signed out): what Minute by Minute does, how it uses Google Calendar,
// and the privacy policy. Google's app review needs a homepage like this.
function Landing() {
  return (
    <div className="pt-6 sm:pt-12">
      <h1 className="font-display text-5xl font-semibold tracking-tight sm:text-6xl">Minute by Minute</h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink/90">
        A time tracker that fills itself in. Your phone notices where you are, your calendar says what&apos;s planned, and Minute by Minute suggests the job you&apos;re
        doing, so starting it is one tap. See where your days actually went, on a timeline and a map.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link href="/welcome" className="rounded-control bg-ink px-5 py-2.5 text-sm font-semibold text-paper">
          Create an account
        </Link>
        <Link href="/login" className="rounded-control px-5 py-2.5 text-sm font-semibold text-ink ring-1 ring-ink/15 hover:bg-surface">
          Sign in
        </Link>
      </div>
      <div className="mt-14 grid gap-8 sm:grid-cols-3">
        <Feature title="Your day, laid out">Every job you start and stop on a timeline, with the places you went and the routes between them on a map.</Feature>
        <Feature title="Google Calendar, if you want it">
          Connect it and your events suggest what you&apos;re about to do and stop a job when its event ends. On the Plan page you can add or move events, and
          they&apos;re saved to your calendar.
        </Feature>
        <Feature title="Yours">Nothing is sold or used for ads. You choose what friends see, and you can delete everything at any time.</Feature>
      </div>
      <p className="mt-14 text-sm text-muted">
        <Link href="/privacy" className="hover:text-ink hover:underline">
          Privacy policy
        </Link>
      </p>
    </div>
  );
}

function Feature({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{children}</p>
    </div>
  );
}
