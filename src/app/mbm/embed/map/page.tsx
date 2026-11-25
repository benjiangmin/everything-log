import { Suspense } from "react";
import { connection } from "next/server";
import { getDay, mbmTz } from "@/mbm/data";
import { mbmReady, mbmUser } from "@/mbm/supabase";
import { dayKeyOf } from "@/mbm/time";
import PhoneMap from "@/mbm/components/PhoneMap";

export const metadata = { title: "Map" };

// The phone app's Map tab: today's map, exactly as the Day page draws it (the same routes, stops
// and buildings), only to look at. Shown inside the app (see /mbm/api/web-session).
export default function EmbedMapPage() {
  return (
    <main className="fixed inset-0 bg-paper">
      <Suspense fallback={<div className="size-full animate-pulse bg-surface" />}>
        <Inner />
      </Suspense>
    </main>
  );
}

async function Inner() {
  await connection();
  if (!mbmReady() || !(await mbmUser())) return <p className="grid size-full place-items-center text-sm text-muted">Sign in on the phone first.</p>;
  const day = await getDay(dayKeyOf(new Date(), mbmTz()));
  return <PhoneMap day={day} />;
}
