import { Suspense } from "react";
import Loading from "@/mbm/components/Loading";
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
      <Suspense fallback={<Loading tall />}>
        <Jobs />
      </Suspense>
    </main>
  );
}

async function Jobs() {
  await connection();
  if (!mbmReady()) return <p className="rounded-card bg-surface px-5 py-4 text-sm">Minute by Minute isn&apos;t connected yet.</p>;
  const user = await mbmUser();
  if (!user) redirect("/login?next=/account/jobs");
  const client = await mbm();
  const jobCols = "id, name, color, own_color, category_id, stop_on_commute, places, start_mode, weekly_goal_min, hide_from_stats, last_used_at";
  const catCols = "id, name, color, stop_on_commute, places, start_mode, weekly_goal_min, hide_from_stats";
  const [jobs, cats, places] = await Promise.all([
    client
      .from("activities")
      .select(`${jobCols}, goal_per`)
      .order("last_used_at", { ascending: false })
      .then((r) => (r.error ? client.from("activities").select(jobCols).order("last_used_at", { ascending: false }) : r)), // (049 not run yet)
    client
      .from("categories")
      .select(`${catCols}, goal_per`)
      .order("name")
      .then((r) => (r.error ? client.from("categories").select(catCols).order("name") : r)),
    client.from("places").select("id, name").order("name").limit(300),
  ]);
  if (jobs.error || cats.error) {
    const plain = await client.from("activities").select("id, name, color, last_used_at").order("last_used_at", { ascending: false });
    return <JobsView needsSql jobs={(plain.data ?? []).map((j) => ({ ...j, stop_on_commute: null, places: null, start_mode: null, weekly_goal_min: null, hide_from_stats: null })) as Job[]} categories={[]} places={(places.data ?? []) as { id: string; name: string }[]} />;
  }
  // (Private jobs and categories, 070: none until it's run.)
  const [pj, pc] = await Promise.all([client.from("activities").select("id, private"), client.from("categories").select("id, private")]);
  const priv = new Set([...((pj.data ?? []) as { id: string; private: boolean }[]), ...((pc.data ?? []) as { id: string; private: boolean }[])].filter((x) => x.private).map((x) => x.id));
  const mark = <T extends { id: string }>(xs: T[]) => xs.map((x) => ({ ...x, private: priv.has(x.id) }));
  return <JobsView now={await loadedAt()} jobs={mark((jobs.data ?? []) as Job[])} categories={mark((cats.data ?? []) as Category[])} places={(places.data ?? []) as { id: string; name: string }[]} />;
}

// (Outside the component: it reads the clock.)
async function loadedAt() {
  return Date.now();
}
