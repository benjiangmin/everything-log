"use client";

import { useState } from "react";
import DateWheel from "@/components/ui/DateWheel";
import { localNow } from "@/lib/month";

function todayKey() {
  const d = localNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// A date that's optional: "+ Start" until you click it, then a date picker with × to remove it.
// Submits "" when there's no date. block: fills the width it's given (the add box's date column).
export default function OptionalDate({
  name,
  label,
  defaultValue,
  block = false,
}: {
  name: string;
  label: string;
  defaultValue: string | null;
  block?: boolean;
}) {
  const [value, setValue] = useState<string | null>(defaultValue);

  if (value === null) {
    return (
      <>
        <input type="hidden" name={name} value="" />
        <button
          type="button"
          onClick={() => setValue(todayKey())}
          className={`${block ? "h-11 w-full text-left" : ""} whitespace-nowrap rounded-control border border-dashed border-muted/50 px-3 py-2.5 text-sm text-muted transition-colors hover:border-muted hover:text-ink`}
        >
          + {label}
        </button>
      </>
    );
  }

  return (
    <div className={`flex items-center gap-0.5 ${block ? "w-full" : ""}`}>
      <div className={block ? "min-w-0 flex-1" : "w-36"}>
        <DateWheel name={name} defaultValue={value} />
      </div>
      <button
        type="button"
        onClick={() => setValue(null)}
        aria-label={`Remove ${label.toLowerCase()} date`}
        title={`Remove ${label.toLowerCase()} date`}
        className="grid size-8 place-items-center rounded-control text-muted transition-colors hover:bg-paper hover:text-ink"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
