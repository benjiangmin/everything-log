import { Suspense } from "react";
import { connection } from "next/server";
import { getDay, mbmTz } from "@/mbm/data";
import { mbmReady, mbmUser } from "@/mbm/supabase";
import { dayKeyOf } from "@/mbm/time";
import PhoneMap from "@/mbm/components/PhoneMap";

export const metadata = { title: "Map" };
// (Inside the app: the page itself never zooms; pinching zooms the map. viewport-fit cover: the page
// starts at the very top of the screen and runs into the bottom corners; without it the phone kept
// it inside the clock and the home bar, and everything placed from the top sat 47 points too low.)
export const viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: "cover" };

// The phone app's Map tab: today's map, exactly as the Day page draws it (the same routes, stops
// and buildings), only to look at. Shown inside the app (see /mbm/api/web-session).
export default function EmbedMapPage({ searchParams }: PageProps<"/mbm/embed/map">) {
  return (
    <main className="fixed inset-0 bg-paper">
      <Suspense fallback={<div className="size-full animate-pulse bg-surface" />}>
        <Inner searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Inner({ searchParams }: { searchParams: PageProps<"/mbm/embed/map">["searchParams"] }) {
  await connection();
  const t = Number((await searchParams).top);
  const top = (await searchParams).top !== undefined && Number.isFinite(t) && t >= 0 && t < 200 ? t : 54;
  if (!mbmReady() || !(await mbmUser())) return <p className="grid size-full place-items-center text-sm text-muted">Sign in on the phone first.</p>;
  const day = await getDay(dayKeyOf(new Date(), mbmTz()));
  const b = Number((await searchParams).bottom);
  const bottom = (await searchParams).bottom !== undefined && Number.isFinite(b) && b >= 0 && b < 100 ? b : 34;
  return <PhoneMap day={day} top={top} bottom={bottom} />;
}
