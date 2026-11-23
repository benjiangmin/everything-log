"use client";

import { setMode, useThemeMode, type ThemeApp, type ThemeMode } from "./theme";

const CHOICES: { mode: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { mode: "day", label: "Day", icon: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></> },
  { mode: "night", label: "Night", icon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" /> },
  { mode: "sun", label: "Sun", icon: <><path d="M3 18h18M7 18a5 5 0 0 1 10 0" /><path d="M12 8V5M5.6 11.6 3.5 9.5M18.4 11.6l2.1-2.1" /></> },
];

// Day / Night / follow the Sun (dark from sunset to sunrise), for one app: three side-by-side
// buttons, the chosen one filled.
export default function ThemeChoice({ app, compact = false }: { app: ThemeApp; compact?: boolean }) {
  const mode = useThemeMode(app);
  return (
    <div role="radiogroup" aria-label="Day or night" className="flex gap-1 rounded-control bg-surface p-1 ring-1 ring-line">
      {CHOICES.map((c) => (
        <button
          key={c.mode}
          type="button"
          role="radio"
          aria-checked={mode === c.mode}
          title={c.mode === "sun" ? "Follow the sun: dark from sunset to sunrise" : c.label}
          onClick={() => setMode(app, c.mode)}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-[8px] px-2 py-1.5 text-xs font-semibold transition-colors ${
            mode === c.mode ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"
          }`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 shrink-0" fill={c.mode === "night" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            {c.icon}
          </svg>
          {!compact && c.label}
        </button>
      ))}
    </div>
  );
}
