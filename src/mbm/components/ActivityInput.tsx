"use client";

import { useId, useRef, useState } from "react";
import type { Activity } from "@/mbm/data";

// A text box for what you're doing, suggesting your activities as you type (↑↓ + Enter to pick).
// Anything new you type becomes a new activity.
export default function ActivityInput({
  activities,
  value,
  onChange,
  onEnter,
  placeholder,
  autoFocus,
  className = "",
}: {
  activities: Activity[];
  value: string;
  onChange: (v: string) => void;
  onEnter?: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const box = useRef<HTMLInputElement>(null);
  const q = value.trim().toLowerCase();
  const matches = q ? activities.filter((a) => a.name.toLowerCase().includes(q) && a.name.toLowerCase() !== q).slice(0, 6) : [];
  const showing = open && matches.length > 0;

  return (
    <div className="relative min-w-0 flex-1">
      <input
        ref={box}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (showing && e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (showing && e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const pick = showing ? matches[active].name : value;
            onChange(pick);
            setOpen(false);
            onEnter?.(pick);
          } else if (e.key === "Escape") setOpen(false);
        }}
        role="combobox"
        aria-expanded={showing}
        aria-controls={listId}
        aria-autocomplete="list"
        maxLength={60}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder={placeholder}
        aria-label={placeholder}
        style={{ outline: "none" }}
        className={`w-full rounded-control border border-line bg-paper px-3 py-2.5 text-ink placeholder:text-muted/70 focus:border-ink ${className}`}
      />
      {showing && (
        <ul id={listId} role="listbox" className="panel-pop absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-control border border-line bg-paper p-1 shadow-xl shadow-ink/15">
          {matches.map((a, i) => (
            <li key={a.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()} // keep focus in the box
                onMouseMove={() => setActive(i)}
                onClick={() => {
                  onChange(a.name);
                  setOpen(false);
                  onEnter?.(a.name);
                }}
                className={`flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-sm ${i === active ? "bg-surface" : ""}`}
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: a.color }} />
                {a.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
