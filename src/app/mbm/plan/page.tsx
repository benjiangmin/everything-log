import { Suspense } from "react";
import Loading from "@/mbm/components/Loading";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { googleStatus, syncCalendar } from "@/mbm/google";
import { mbm, mbmReady, mbmUser } from "@/mbm/supabase";
import PlanSettings from "@/mbm/components/PlanSettings";
import { calendarHidden, calendarIgnored } from "@/mbm/plans";

export const metadata = { title: "Plan" };

// Plan, while it's being rebuilt: its two Google Calendar settings, and a note. (The day planner
// is in PlanView.tsx, kept for when it comes back.)
export default function PlanPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full flex-col px-4 pb-24 pt-6 sm:w-[96%] sm:px-0 sm:pt-8">
      <Suspense fallback={<Loading tall />}>
        <Plan />
      </Suspense>
    </main>
  );
}

async function Plan() {
  await connection();
  if (!mbmReady()) return <p className="rounded-card bg-surface px-5 py-4 text-sm">Minute by Minute isn&apos;t connected yet.</p>;
  const user = await mbmUser();
  if (!user) redirect("/login?next=/plan");
  const client = await mbm();
  await syncCalendar(client).catch(() => null); // (at most every 10 minutes)
  const [hidden, ignored, google] = await Promise.all([calendarHidden(client), calendarIgnored(client), googleStatus(client).catch(() => null)]);
  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Plan</h1>
      <div className="mt-4">
        <PlanSettings connected={!!google?.connected} calendarHidden={hidden} calendarIgnored={ignored} />
      </div>
      <div className="grid flex-1 place-items-center py-16 text-center">
        <div>
          <p className="font-display text-2xl font-semibold">Page under construction</p>
          <p className="mt-2 text-muted">Planning your day is coming back here soon.</p>
        </div>
      </div>
    </>
  );
}
