import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { mbm, mbmReady, mbmUser } from "@/mbm/supabase";
import { mbmTz } from "@/mbm/data";
import PlacesView, { type PlaceRow, type StopRow } from "@/mbm/components/PlacesView";

export const metadata = { title: "Places" };

// All your places, and the stops you haven't named, in one spot.
export default function PlacesPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 pt-10 sm:pt-14">
      <Suspense fallback={<div aria-busy="true" className="h-96 animate-pulse rounded-card bg-line" />}>
        <Places />
      </Suspense>
    </main>
  );
}

async function Places() {
  await connection();
  if (!mbmReady()) return <p className="rounded-card bg-surface px-5 py-4 text-sm">Minute by Minute isn&apos;t connected yet.</p>;
  const user = await mbmUser();
  if (!user) redirect("/mbm/login?next=/mbm/account/places");
  const { places, stops, needsSql, now } = await load();
  return <PlacesView places={places} stops={stops} tz={mbmTz()} now={now} needsSql={needsSql} />;
}

// (Outside the component: it reads the clock.)
async function load() {
  const now = Date.now();
  const client = await mbm();
  const since = new Date(now - 365 * 864e5).toISOString();
  const [placesRes, visitsRes] = await Promise.all([
    client
      .from("places")
      .select("id, name, own_name, real_name, real_address, lat, lng")
      .order("name")
      .then((r) => (r.error ? client.from("places").select("id, name, lat, lng").order("name") : r)),
    client.from("visits").select("id, place_id, arrived_at, departed_at, lat, lng, auto_name").gte("arrived_at", since).order("arrived_at", { ascending: false }).limit(5000),
  ]);
  const visits = (visitsRes.data ?? []) as { id: string; place_id: string | null; arrived_at: string; departed_at: string | null; lat: number; lng: number; auto_name: string | null }[];
  const stats = new Map<string, { count: number; last: string }>();
  for (const v of visits) {
    if (!v.place_id) continue;
    const s = stats.get(v.place_id);
    if (s) s.count++;
    else stats.set(v.place_id, { count: 1, last: v.arrived_at });
  }
  const places: PlaceRow[] = ((placesRes.data ?? []) as Omit<PlaceRow, "count" | "last">[]).map((p) => ({ ...p, count: stats.get(p.id)?.count ?? 0, last: stats.get(p.id)?.last ?? null }));
  const month = now - 30 * 864e5;
  const stops: StopRow[] = visits.filter((v) => !v.place_id && +new Date(v.arrived_at) > month).slice(0, 200);
  return { places, stops, now, needsSql: !!placesRes.error || !("real_name" in ((placesRes.data ?? [])[0] ?? { real_name: null })) };
}
