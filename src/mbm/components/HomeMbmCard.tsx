"use client";

import Link from "next/link";
import type { Day } from "@/mbm/data";
import DayBar from "./DayBar";
import NowCard from "./NowCard";
import { segmentsOf } from "./segments";
import { useNow } from "./useNow";

export default function HomeMbmCard({ day, renderedAt }: { day: Day; renderedAt: number }) {
  const now = useNow(renderedAt);
  const dayStart = +new Date(day.start);
  const dayEnd = +new Date(day.end);
  return (
    <section aria-label="Minute by Minute" className="mt-6">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="font-display text-lg font-semibold">Minute by Minute</h2>
        <Link href="/mbm" className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
          Open today →
        </Link>
      </div>
      <NowCard activities={day.activities} now={day.now} tz={day.tz} renderedAt={renderedAt} compact />
      <Link href="/mbm" aria-label="Open today" className="mt-2 block">
        <DayBar
          segments={segmentsOf(day.blocks, dayStart, dayEnd, now)}
          dayKey={day.dayKey}
          dayStart={dayStart}
          dayEnd={dayEnd}
          now={now}
          tz={day.tz}
          byId={new Map(day.activities.map((a) => [a.id, a]))}
          compact
        />
      </Link>
    </section>
  );
}
