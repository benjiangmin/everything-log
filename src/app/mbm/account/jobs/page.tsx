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
  // (Private jobs and categories, 070: none until it's run. Linked calendar names, 073. And the
  // names on your calendar lately and soon, to link.)
  const now = await loadedAt();
  const [pj, pc, cn, ev, se, sc, ci] = await Promise.all([
    client.from("activities").select("id, private"),
    client.from("categories").select("id, private"),
    client.from("activities").select("id, calendar_names"),
    client
      .from("calendar_events")
      .select("title")
      .eq("all_day", false)
      .gte("starts_at", new Date(now - 60 * 86400_000).toISOString())
      .lt("starts_at", new Date(now + 30 * 86400_000).toISOString())
      .limit(3000),
    // (Stopping at the event's end, 074: hidden until it's run.)
    client.from("activities").select("id, stop_at_event_end"),
    client.from("categories").select("id, stop_at_event_end"),
    client.from("activities").select("id, calendar_ignore"), // (075)
  ]);
  const ignored = new Map(((ci.data ?? []) as { id: string; calendar_ignore: string[] | null }[]).map((x) => [x.id, x.calendar_ignore ?? []]));
  const endJ = se.error ? null : new Map(((se.data ?? []) as { id: string; stop_at_event_end: boolean | null }[]).map((x) => [x.id, x.stop_at_event_end]));
  const endC = sc.error ? null : new Map(((sc.data ?? []) as { id: string; stop_at_event_end: boolean | null }[]).map((x) => [x.id, x.stop_at_event_end]));
  const linked = new Map(((cn.data ?? []) as { id: string; calendar_names: string[] | null }[]).map((x) => [x.id, x.calendar_names ?? []]));
  const counts = new Map<string, { title: string; n: number }>();
  for (const e of (ev.data ?? []) as { title: string | null }[]) {
    const t = e.title?.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    const c = counts.get(k) ?? { title: t, n: 0 };
    c.n += 1;
    counts.set(k, c);
  }
  const events = [...counts.values()].sort((a, b) => b.n - a.n);
  const priv = new Set([...((pj.data ?? []) as { id: string; private: boolean }[]), ...((pc.data ?? []) as { id: string; private: boolean }[])].filter((x) => x.private).map((x) => x.id));
  const mark = <T extends { id: string }>(xs: T[]) => xs.map((x) => ({ ...x, private: priv.has(x.id) }));
  return <JobsView now={await loadedAt()} events={events} jobs={mark((jobs.data ?? []) as Job[]).map((j) => ({ ...j, calendar_names: linked.get(j.id) ?? [], calendar_ignore: ignored.get(j.id) ?? [], ...(endJ ? { stop_at_event_end: endJ.get(j.id) ?? null } : {}) }))} categories={mark((cats.data ?? []) as Category[]).map((c) => ({ ...c, ...(endC ? { stop_at_event_end: endC.get(c.id) ?? null } : {}) }))} places={(places.data ?? []) as { id: string; name: string }[]} />;
}

// (Outside the component: it reads the clock.)
async function loadedAt() {
  return Date.now();
}
