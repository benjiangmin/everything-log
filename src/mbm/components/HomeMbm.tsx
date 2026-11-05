import Link from "next/link";
import { connection } from "next/server";
import { getDay, mbmTz } from "@/mbm/data";
import { mbmReady, mbmUser } from "@/mbm/supabase";
import { dayKeyOf } from "@/mbm/time";
import HomeMbmCard from "./HomeMbmCard";

// The top of the home page: Minute by Minute's "now" and today's bar. Nothing if it isn't set up.
export default async function HomeMbm() {
  await connection();
  if (!mbmReady()) return null;
  const user = await mbmUser();
  if (!user) {
    return (
      <Link href="/mbm/login?next=/" className="mt-6 flex items-center justify-between rounded-card border-2 border-ink px-5 py-4 transition-colors hover:bg-surface">
        <span>
          <span className="block font-display text-lg font-semibold">Minute by Minute</span>
          <span className="text-sm text-muted">Sign in to track your day</span>
        </span>
        <span aria-hidden="true" className="text-muted">
          →
        </span>
      </Link>
    );
  }
  const day = await getDay(dayKeyOf(new Date(), mbmTz())).catch((e: Error) => e);
  if (day instanceof Error) return <p className="mt-6 rounded-card border-2 border-ink px-5 py-4 text-sm text-danger">Minute by Minute: {day.message}</p>;
  return <HomeMbmCard day={day} renderedAt={day.loadedAt} />;
}
