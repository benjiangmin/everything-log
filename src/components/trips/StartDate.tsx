"use client";

import { useTransition } from "react";
import { setTripStart } from "@/app/trips/actions";
import DateWheel from "@/components/ui/DateWheel";
import { localNow } from "@/lib/month";

function todayKey() {
  const d = localNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The trip's start date (Day 1), in a box next to search. Optional: "Start date?" until you pick
// one; × clears it. With a start date, every day also shows its real date.
export default function StartDate({ tripId, start }: { tripId: string; start: string | null }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className={`mt-2 flex items-center gap-0.5 transition-opacity ${pending ? "opacity-60" : ""}`}>
      <div className="w-44" title="Day 1's date (optional)">
        <DateWheel
          key={start ?? "none"}
          name="start_date"
          defaultValue={start ?? todayKey()}
          display={start ? undefined : "Start date?"}
          onChange={(d) => startTransition(() => setTripStart(tripId, d))}
        />
      </div>
      {start && (
        <button
          type="button"
          onClick={() => startTransition(() => setTripStart(tripId, null))}
          aria-label="Remove the start date"
          title="Remove the start date"
          className="grid size-8 place-items-center rounded-control text-muted transition-colors hover:bg-surface hover:text-ink"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
