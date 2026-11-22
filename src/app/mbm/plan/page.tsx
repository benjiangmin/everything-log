import { Suspense } from "react";
import Loading from "@/mbm/components/Loading";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { mbmTz } from "@/mbm/data";
import { canWrite, googleStatus, syncCalendar } from "@/mbm/google";
import { mbm, mbmReady, mbmUser } from "@/mbm/supabase";
import { dayKeyOf, dayRange } from "@/mbm/time";
import PlanView from "@/mbm/components/PlanView";
import { calendarHidden, eventsBetween, isGoogleEvent } from "@/mbm/plans";

export const metadata = { title: "Plan" };

// Plan: a day ahead (or any day) on one big bar, your Google Calendar on it, and new plans added
// by clicking the bar, like Google Calendar.
export default function PlanPage(props: PageProps<"/mbm/plan">) {
  return (
    <main className="mx-auto w-full px-4 pb-24 pt-6 sm:w-[96%] sm:px-0 sm:pt-8">
      <Suspense fallback={<Loading tall />}>
        {props.searchParams.then((p) => (
          <Plan day={typeof p.day === "string" ? p.day : undefined} open={typeof p.event === "string" ? p.event : undefined} />
        ))}
      </Suspense>
    </main>
  );
}

async function Plan({ day: asked, open }: { day?: string; open?: string }) {
  await connection();
  if (!mbmReady()) return <p className="rounded-card bg-surface px-5 py-4 text-sm">Minute by Minute isn&apos;t connected yet.</p>;
  const user = await mbmUser();
  if (!user) redirect("/mbm/login?next=/mbm/plan");
  const tz = mbmTz();
  const today = dayKeyOf(new Date(), tz);
  const day = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : today;
  const { start, end } = dayRange(day, tz);
  const client = await mbm();
  await syncCalendar(client).catch(() => null); // (at most every 10 minutes)
  const [all, hidden, places, google, write, acts, renderedAt] = await Promise.all([
    eventsBetween(client, start, end),
    calendarHidden(client),
    client.from("places").select("id, name, lat, lng").not("name", "is", null).limit(300),
    googleStatus(client).catch(() => null),
    canWrite(client).catch(() => false),
    client.from("activities").select("name, color"),
    loadedAt(),
  ]);
  const events = hidden ? all.filter((e) => !isGoogleEvent(e)) : all;
  return (
    <PlanView
      calendarHidden={hidden}
      day={day}
      today={today}
      tz={tz}
      dayStart={+start}
      dayEnd={+end}
      events={events.filter((e) => !e.all_day)}
      allDay={events.filter((e) => e.all_day)}
      places={(places.data ?? []) as { id: string; name: string; lat: number; lng: number }[]}
      google={google}
      canWrite={write}
      colors={Object.fromEntries(((acts.data ?? []) as { name: string; color: string }[]).map((a) => [a.name.toLowerCase(), a.color]))}
      openId={open ?? null}
      renderedAt={renderedAt}
    />
  );
}

async function loadedAt() {
  return Date.now();
}
