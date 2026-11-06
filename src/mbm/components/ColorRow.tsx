"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { setActivityColor } from "@/app/mbm/actions";
import type { Activity } from "@/mbm/data";
import { PALETTE } from "@/mbm/colors";

// An activity's color, as a dot (in the name box). Click it for the palette, or any color (the
// last circle). Changes every entry of it.
export default function ColorRow({ activity }: { activity: Activity }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const [color, setColor] = useState(activity.color.toLowerCase());
  const [message, setMessage] = useState<string | null>(null);
  const [, run] = useTransition();
  const wait = useRef<ReturnType<typeof setTimeout> | null>(null);

  function pick(next: string) {
    const was = activity.color.toLowerCase();
    setColor(next.toLowerCase());
    setMessage(null);
    run(async () => {
      const res = await setActivityColor(activity.id, next);
      if (!res.ok) {
        setColor(was);
        setMessage(res.message);
      }
    });
  }

  const custom = !PALETTE.includes(color);
  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Color for ${activity.name}`}
        title={`Color for all ${activity.name} entries`}
        className="grid size-7 place-items-center rounded-full transition-transform hover:scale-110"
      >
        <span className="size-5 rounded-full ring-2 ring-paper ring-offset-1 ring-offset-line" style={{ background: color }} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-max rounded-card bg-paper p-3 shadow-xl shadow-ink/15 ring-1 ring-line">
          <p className="mb-2 text-xs text-muted">
            Color for all <span className="font-semibold text-ink">{activity.name}</span> entries
          </p>
      <div className="grid grid-cols-7 gap-1.5" role="radiogroup" aria-label={`Color for ${activity.name}`}>
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={color === c}
            aria-label={c}
            onClick={() => pick(c)}
            className={`size-7 rounded-full transition-transform hover:scale-110 ${color === c ? "ring-2 ring-ink ring-offset-2 ring-offset-paper" : ""}`}
            style={{ background: c }}
          />
        ))}
        {/* Any color: the browser's own picker. */}
        <label
          title="Any color"
          className={`relative grid size-7 cursor-pointer place-items-center overflow-hidden rounded-full transition-transform hover:scale-110 ${
            custom ? "ring-2 ring-ink ring-offset-2 ring-offset-paper" : "ring-1 ring-line"
          }`}
          style={{ background: custom ? color : "conic-gradient(#a3473a, #d4a373, #6b8f71, #5e7b9b, #8e6c8a, #a3473a)" }}
        >
          <input
            type="color"
            value={color}
            onChange={(e) => {
              // Saves once you stop dragging around the picker for a moment.
              const next = e.target.value;
              setColor(next.toLowerCase());
              if (wait.current) clearTimeout(wait.current);
              wait.current = setTimeout(() => pick(next), 600);
            }}
            aria-label="Any color"
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>
      {message && <p className="mt-1 text-xs text-danger">{message}</p>}
        </div>
      )}
    </div>
  );
}
