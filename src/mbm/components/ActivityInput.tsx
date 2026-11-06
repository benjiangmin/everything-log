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
  trailing,
}: {
  activities: Activity[];
  value: string;
  onChange: (v: string) => void;
  onEnter?: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  className?: string;
  trailing?: React.ReactNode; // inside the box, on the right (e.g. "+ Note")
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const box = useRef<HTMLInputElement>(null);
  const q = value.trim().toLowerCase();
  // What you've typed exactly first (so Enter keeps "Work", not "working on this project"), then
  // ones starting with it, then the rest.
  const rank = (name: string) => (name === q ? 0 : name.startsWith(q) ? 1 : 2);
  const matches = q
    ? activities
        .filter((a) => a.name.toLowerCase().includes(q))
        .sort((a, b) => rank(a.name.toLowerCase()) - rank(b.name.toLowerCase()))
        .slice(0, 6)
    : [];
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
        className={`w-full rounded-control border border-line bg-paper px-3 py-2.5 text-ink placeholder:text-muted/70 focus:border-ink ${trailing ? "pr-32" : ""} ${className}`}
      />
      {trailing && <div className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</div>}
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
