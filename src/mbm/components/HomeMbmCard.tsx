"use client";

import Link from "next/link";
import type { Day } from "@/mbm/data";
import DayBar from "./DayBar";
import LiveRefresh from "./LiveRefresh";
import NowStatus from "./NowStatus";
import { layOut } from "./segments";
import { useNow } from "./useNow";
import { MBM_ORIGIN } from "@/mbm/paths";

// The home page's Minute by Minute: what's running and today's bar (click it for the full day).
export default function HomeMbmCard({ day, renderedAt }: { day: Day; renderedAt: number }) {
  const now = useNow(renderedAt);
  const dayStart = +new Date(day.start);
  const dayEnd = +new Date(day.end);
  // (Just the main row here: the row under it, e.g. a Commute under Work, is on the Day page.)
  const { placed: all, gaps } = layOut(day.blocks, dayStart, dayEnd, now);
  const placed = all.filter((p) => p.lane === 0);
  const lanes = 1;
  return (
    <section aria-label="Minute by Minute" className="mt-6 rounded-card border-2 border-ink p-4 sm:p-5">
      <LiveRefresh />
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-lg font-semibold">Minute by Minute</h2>
        <Link href={`${MBM_ORIGIN}/day`} className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
          Open today →
        </Link>
      </div>
      <Link href={`${MBM_ORIGIN}/day`} aria-label="Open today" className="mb-3 block">
        <DayBar
          placed={placed}
          lanes={lanes}
          gaps={gaps}
          dayKey={day.dayKey}
          dayStart={dayStart}
          dayEnd={dayEnd}
          now={now}
          tz={day.tz}
          byId={new Map(day.activities.map((a) => [a.id, a]))}
          compact
        />
      </Link>
      <NowStatus activities={day.activities} running={day.running} tz={day.tz} renderedAt={renderedAt} compact />
    </section>
  );
}
