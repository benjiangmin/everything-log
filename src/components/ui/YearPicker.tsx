"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { localNow } from "@/lib/month";

// The year in the title bar. Click it to pick any year from a grid of 12 (‹ › for more).
export default function YearPicker({ year }: { year: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(year - 7); // first year shown in the grid
  const boxRef = useRef<HTMLDivElement>(null);
  const thisYear = localNow().getFullYear();

  // Close when clicking outside or pressing Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function go(y: number) {
    setOpen(false);
    router.push(`${pathname}?y=${y}`);
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setStart(year - 7);
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        className="num rounded-control px-3 py-1 font-display text-2xl font-semibold tracking-tight transition-colors hover:bg-accent-ink/10 sm:text-3xl"
      >
        {year}
      </button>

      {open && (
        <div className="absolute left-1/2 top-full z-20 mt-2 w-72 -translate-x-1/2 rounded-card border border-line bg-paper p-4 text-ink shadow-xl shadow-ink/10">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStart((s) => s - 12)}
              aria-label="Earlier years"
              className="grid size-9 place-items-center rounded-control hover:bg-surface"
            >
              ‹
            </button>
            <span className="num text-sm text-muted">
              {start} – {start + 11}
            </span>
            <button
              type="button"
              onClick={() => setStart((s) => s + 12)}
              aria-label="Later years"
              className="grid size-9 place-items-center rounded-control hover:bg-surface"
            >
              ›
            </button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {Array.from({ length: 12 }, (_, i) => start + i).map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => go(y)}
                className={`num rounded-control py-2 text-sm transition-colors ${
                  y === year ? "bg-accent text-accent-ink" : "hover:bg-surface"
                } ${y === thisYear && y !== year ? "font-semibold underline underline-offset-4" : ""}`}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
