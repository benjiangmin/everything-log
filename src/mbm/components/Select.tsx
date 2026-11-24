"use client";

import { useEffect, useId, useRef, useState } from "react";
import Floating from "./Floating";

export type Option = { value: string; label: string };

// A dropdown in the app's own look (instead of the browser's grey and blue list). Works like a
// select: controlled (value + onChange) or, inside a form, uncontrolled (name + defaultValue,
// sent with the form). Keyboard: arrows, Enter, Escape, and typing a letter jumps to it.
export default function Select({
  value,
  defaultValue,
  onChange,
  options,
  name,
  disabled = false,
  label,
  className = "",
  quiet = false,
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  options: Option[];
  name?: string;
  disabled?: boolean;
  label?: string; // (for screen readers, when there's no visible label)
  className?: string; // its width (full width when not given)
  quiet?: boolean; // the chosen text muted, so it reads quieter than what it's for
}) {
  const [own, setOwn] = useState(defaultValue ?? options[0]?.value ?? "");
  const current = value ?? own;
  const [open, setOpen] = useState(false);
  const [lit, setLit] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const id = useId();
  const chosen = options.find((o) => o.value === current);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && !pop.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  useEffect(() => {
    if (open) list.current?.children[lit]?.scrollIntoView({ block: "nearest" });
  }, [open, lit]);

  const pick = (v: string) => {
    if (value === undefined) setOwn(v);
    onChange?.(v);
    setOpen(false);
  };
  const show = () => {
    setLit(Math.max(0, options.findIndex((o) => o.value === current)));
    setOpen(true);
  };

  return (
    <div ref={box} className={`relative ${className || "w-full"}`}>
      {name && <input type="hidden" name={name} value={current} />}
      <button
        ref={btn}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (e.key === "Escape") return setOpen(false);
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) return show();
            setLit((i) => Math.min(options.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1))));
          } else if ((e.key === "Enter" || e.key === " ") && open) {
            e.preventDefault();
            if (options[lit]) pick(options[lit].value);
          } else if (e.key.length === 1 && /\S/.test(e.key)) {
            const k = e.key.toLowerCase();
            const from = open ? lit : options.findIndex((o) => o.value === current);
            const order = [...options.slice(from + 1), ...options.slice(0, from + 1)];
            const hit = order.find((o) => o.label.toLowerCase().startsWith(k));
            if (hit) {
              const i = options.indexOf(hit);
              if (open) setLit(i);
              else pick(hit.value);
            }
          }
        }}
        className={`flex w-full items-center justify-between gap-2 rounded-control border bg-paper px-3 py-2.5 text-left text-sm font-normal transition-colors disabled:opacity-50 ${
          open ? "border-ink" : "border-line hover:border-ink/40"
        } ${quiet ? "text-muted" : "text-ink"}`}
      >
        <span className="truncate">{chosen?.label ?? "Choose…"}</span>
        <svg viewBox="0 0 20 20" className={`size-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="m5.5 8 4.5 4.5L14.5 8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <Floating anchor={btn} popRef={pop}>
        <ul
          ref={list}
          id={id}
          role="listbox"
          aria-label={label}
          className="max-h-72 overflow-y-auto rounded-card bg-paper p-1.5 shadow-xl shadow-ink/15 ring-1 ring-line"
        >
          {options.map((o, i) => {
            const on = o.value === current;
            return (
              <li
                key={o.value}
                role="option"
                aria-selected={on}
                onMouseEnter={() => setLit(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o.value)}
                className={`flex cursor-pointer items-center justify-between gap-4 whitespace-nowrap rounded-control px-3 py-2 text-sm ${i === lit ? "bg-surface" : ""} ${
                  on ? "font-semibold text-ink" : "text-ink/80"
                }`}
              >
                {o.label}
                {on && (
                  <svg viewBox="0 0 20 20" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                    <path d="m4.5 10.5 3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
        </Floating>
      )}
    </div>
  );
}
