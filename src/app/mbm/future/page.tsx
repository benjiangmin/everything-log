import { Suspense } from "react";
import Loading from "@/mbm/components/Loading";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { mbmTz } from "@/mbm/data";
import { mbm, mbmReady, mbmUser } from "@/mbm/supabase";
import type { Profile } from "@/mbm/life";
import AheadView from "@/mbm/components/AheadView";

export const metadata = { title: "Future" };

// Future: your whole life as one bar (how much you've lived, and roughly how much is left, from
// U.S. life tables for people like you), and what the rest of it is likely to go to.
export default function FuturePage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 pt-10 sm:pt-14">
      <Suspense fallback={<Loading tall />}>
        <Future />
      </Suspense>
    </main>
  );
}

async function Future() {
  await connection();
  if (!mbmReady()) return <p className="rounded-card bg-surface px-5 py-4 text-sm">Minute by Minute isn&apos;t connected yet.</p>;
  const user = await mbmUser();
  if (!user) redirect("/login?next=/future");
  const client = await mbm();
  const [profile, avg, acts, renderedAt] = await Promise.all([
    // (039 adds education, smoking and exercise; until it's run, just the first ones.)
    client
      .from("profiles")
      .select("name, birthday, sex, race, state, education, smoking, exercise, skipped")
      .maybeSingle()
      .then(async (r) => (r.error ? await client.from("profiles").select("name, birthday, sex, race, state, skipped").maybeSingle() : r)),
    client.rpc("daily_averages", { p_days: 30, p_tz: mbmTz() }),
    client.from("activities").select("name, color"),
    loadedAt(),
  ]);
  if (profile.error) {
    return <p className="rounded-card bg-surface px-5 py-4 text-sm">Almost there: run <code>038_about_you.sql</code> in Supabase to turn this page on.</p>;
  }
  const colors = Object.fromEntries(((acts.data ?? []) as { name: string; color: string }[]).map((a) => [a.name, a.color]));
  return (
    <AheadView
      profile={(profile.data as Profile | null) ?? null}
      averages={avg.error ? null : (avg.data as { days: number; perDay: Record<string, number>; screenPerDay: number })}
      colors={colors}
      renderedAt={renderedAt}
    />
  );
}

// (When this was loaded: the page works out your age from it.)
async function loadedAt() {
  return Date.now();
}
