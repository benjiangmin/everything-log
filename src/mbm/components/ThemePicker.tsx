"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyColorTheme } from "@/app/mbm/actions";
import { THEMES, themeById } from "@/mbm/colors";
import { useConfirm } from "@/components/ui/ConfirmDialog";

// The color theme: every job and category takes its colors (the busiest first).
export default function ThemePicker({ current }: { current: string | null }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [chosen, setChosen] = useState(current);
  const use = async (id: string, reset: boolean) => {
    const t = themeById(id)!;
    // (The first theme, or "Recolor everything": colors you picked go too. Ask first.)
    if (reset && !(await confirm({ title: `Recolor everything with ${t.name}?`, body: "Every job and category takes its colors, including ones you colored yourself. You can still change any of them after.", confirmLabel: "Recolor" }))) return;
    setChosen(id);
    start(async () => {
      const res = await applyColorTheme(id, reset);
      if (!res.ok) {
        setChosen(current);
        return setMessage(res.message);
      }
      setMessage(null);
      router.refresh();
    });
  };
  return (
    <section>
      {([["One color", THEMES.filter((t) => t.one)], ["Mixed", THEMES.filter((t) => !t.one)]] as const).map(([label, list]) => (
        <div key={label}>
          <p className="mt-3 text-sm text-muted">{label}</p>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
        {list.map((t) => {
          const on = chosen === t.id;
          return (
            <button
              key={t.id}
              type="button"
              disabled={pending}
              aria-pressed={on}
              onClick={() => !on && use(t.id, current === null)}
              className={`flex items-center gap-3 rounded-card border bg-paper px-4 py-3 text-left transition-colors disabled:opacity-70 ${on ? "border-ink" : "border-line hover:border-ink/40"}`}
            >
              <span className="w-16 shrink-0 text-sm font-semibold">{t.name}</span>
              <span className="flex min-w-0 flex-1 overflow-hidden rounded-full" aria-hidden="true">
                {t.colors.slice(0, 10).map((c) => (
                  <span key={c} className="h-4 flex-1" style={{ background: c }} />
                ))}
              </span>
              {on && (
                <svg viewBox="0 0 20 20" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                  <path d="m4.5 10.5 3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          );
        })}
          </div>
        </div>
      ))}
      {chosen && (
        <button type="button" disabled={pending} onClick={() => use(chosen, true)} className="mt-2 text-sm font-semibold text-muted hover:text-ink hover:underline disabled:opacity-50">
          {pending ? "Recoloring…" : "Recolor everything, including colors you picked"}
        </button>
      )}
      {message && <p className="mt-2 text-sm text-danger">{message}</p>}
    </section>
  );
}
