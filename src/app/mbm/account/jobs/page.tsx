import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { mbm, mbmReady, mbmUser } from "@/mbm/supabase";
import JobsView, { type Category, type Job } from "@/mbm/components/JobsView";

export const metadata = { title: "Jobs" };

// Jobs and categories: what each job does when you leave, its places, goals; and categories
// (Schooling: CS577, ENTOM...) that give their jobs one color and settings.
export default function JobsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 pt-10 sm:pt-14">
      <Suspense fallback={<div aria-busy="true" className="h-96 animate-pulse rounded-card bg-line" />}>
        <Jobs />
      </Suspense>
    </main>
  );
}

async function Jobs() {
  await connection();
  if (!mbmReady()) return <p className="rounded-card bg-surface px-5 py-4 text-sm">Minute by Minute isn&apos;t connected yet.</p>;
  const user = await mbmUser();
  if (!user) redirect("/mbm/login?next=/mbm/account/jobs");
  const client = await mbm();
  const [jobs, cats, places] = await Promise.all([
    client.from("activities").select("id, name, color, own_color, category_id, stop_on_commute, places, auto_start, weekly_goal_min, hide_from_stats, last_used_at").order("last_used_at", { ascending: false }),
    client.from("categories").select("id, name, color, stop_on_commute, places, auto_start, weekly_goal_min, hide_from_stats").order("name"),
    client.from("places").select("id, name").order("name").limit(300),
  ]);
  if (jobs.error || cats.error) {
    const plain = await client.from("activities").select("id, name, color, last_used_at").order("last_used_at", { ascending: false });
    return <JobsView needsSql jobs={(plain.data ?? []).map((j) => ({ ...j, stop_on_commute: null, places: null, auto_start: null, weekly_goal_min: null, hide_from_stats: null })) as Job[]} categories={[]} places={(places.data ?? []) as { id: string; name: string }[]} />;
  }
  return <JobsView jobs={(jobs.data ?? []) as Job[]} categories={(cats.data ?? []) as Category[]} places={(places.data ?? []) as { id: string; name: string }[]} />;
}
