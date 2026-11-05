"use client";

import { useRef, useState, useTransition } from "react";
import { setActivityColor } from "@/app/mbm/actions";
import type { Activity } from "@/mbm/data";
import { PALETTE } from "@/mbm/colors";

// An activity's color: the palette, or any color (the last circle). Changes every entry of it.
export default function ColorRow({ activity }: { activity: Activity }) {
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
    <div>
      <p className="mb-2 text-sm text-muted">
        Color for all <span className="font-semibold text-ink">{activity.name}</span> entries
      </p>
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={`Color for ${activity.name}`}>
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
  );
}
