"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// An icon button that opens a short list to pick one from (sort, filter). Places and Jobs.
export default function IconMenu({
  label,
  icon,
  value,
  options,
  onPick,
  active = false,
}: {
  label: string;
  icon: ReactNode;
  value: string;
  options: (readonly [string, string])[];
  onPick: (v: string) => void;
  active?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={`grid size-9 place-items-center rounded-full ring-1 transition-colors ${active ? "bg-ink text-paper ring-ink" : open ? "bg-surface text-ink ring-ink/30" : "text-muted ring-line hover:text-ink"}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          {icon}
        </svg>
      </button>
      {open && (
        <div role="menu" aria-label={label} className="absolute right-0 top-11 z-30 min-w-56 rounded-card bg-paper p-1.5 shadow-xl shadow-ink/15 ring-1 ring-line">
          <p className="px-3 pb-1 pt-1.5 text-xs font-semibold text-muted">{label}</p>
          {options.map(([v, text]) => (
            <button
              key={v}
              type="button"
              role="menuitemradio"
              aria-checked={value === v}
              onClick={() => {
                onPick(v);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-control px-3 py-2 text-left text-sm hover:bg-surface ${value === v ? "font-semibold" : ""}`}
            >
              <span className="w-4 shrink-0 text-accent" aria-hidden="true">
                {value === v ? "✓" : ""}
              </span>
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
