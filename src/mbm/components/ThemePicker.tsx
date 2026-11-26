"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { applyColorTheme, deleteOwnTheme, saveOwnTheme } from "@/app/mbm/actions";
import { OWN_COLORS, THEMES, themeById, type Theme } from "@/mbm/colors";
import { useConfirm } from "@/components/ui/ConfirmDialog";

// The color theme: every job and category takes its colors (the busiest first). Yours (088): a
// name and ten colors you pick; null when 088 isn't run yet.
export default function ThemePicker({ current, own }: { current: string | null; own: Theme[] | null }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [chosen, setChosen] = useState(current);
  const [editing, setEditing] = useState<Theme | "new" | null>(null);
  const mine = own ?? [];
  const use = async (id: string, reset: boolean) => {
    const t = themeById(id, mine)!;
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
  const row = (t: Theme, extra?: ReactNode) => {
    const on = chosen === t.id;
    return (
      <div key={t.id} className={`flex items-center gap-3 rounded-card border bg-paper px-4 py-3 transition-colors ${on ? "border-ink" : "border-line hover:border-ink/40"}`}>
        <button
          type="button"
          disabled={pending}
          aria-pressed={on}
          onClick={() => !on && use(t.id, current === null)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-70"
        >
          <span className="w-16 shrink-0 truncate text-sm font-semibold">{t.name}</span>
          <span className="flex min-w-0 flex-1 overflow-hidden rounded-full" aria-hidden="true">
            {t.colors.slice(0, 10).map((c, i) => (
              <span key={i} className="h-4 flex-1" style={{ background: c }} />
            ))}
          </span>
          {on && (
            <svg viewBox="0 0 20 20" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <path d="m4.5 10.5 3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
        {extra}
      </div>
    );
  };
  return (
    <section>
      {([["One color", THEMES.filter((t) => t.one)], ["Mixed", THEMES.filter((t) => !t.one)]] as const).map(([label, list]) => (
        <div key={label}>
          <p className="mt-3 text-sm text-muted">{label}</p>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-2">{list.map((t) => row(t))}</div>
        </div>
      ))}

      {/* Yours: themes you made, and a way to make one. */}
      <p className="mt-3 text-sm text-muted">Yours</p>
      {own === null ? (
        <p className="mt-1.5 text-sm text-muted">Run supabase/minute-by-minute/088_custom_themes.sql in Supabase to make your own.</p>
      ) : (
        <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
          {mine.map((t) =>
            row(
              t,
              <button type="button" onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`} className="grid size-7 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink">
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />
                </svg>
              </button>,
            ),
          )}
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="flex items-center justify-center gap-2 rounded-card border-2 border-dashed border-line px-4 py-3 text-sm font-semibold text-muted transition-colors hover:border-muted hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Make your own
          </button>
        </div>
      )}
      {editing && (
        <OwnTheme
          theme={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDeleted={(id) => {
            if (chosen === id) setChosen(null);
            setEditing(null);
            router.refresh();
          }}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      {chosen && (
        <button type="button" disabled={pending} onClick={() => use(chosen, true)} className="mt-3 text-sm font-semibold text-muted hover:text-ink hover:underline disabled:opacity-50">
          {pending ? "Recoloring…" : "Recolor everything, including colors you picked"}
        </button>
      )}
      {message && <p className="mt-2 text-sm text-danger">{message}</p>}
    </section>
  );
}

// Making or changing one of your own: a name, and ten colors (tap one to change it). Starts from
// the Earth colors.
function OwnTheme({ theme, onClose, onSaved, onDeleted }: { theme: Theme | null; onClose: () => void; onSaved: () => void; onDeleted: (id: string) => void }) {
  const confirm = useConfirm();
  const [name, setName] = useState(theme?.name ?? "");
  const [colors, setColors] = useState<string[]>(() => {
    const base = theme?.colors ?? themeById("earth")!.colors;
    return Array.from({ length: OWN_COLORS }, (_, i) => base[i % base.length]);
  });
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-3 rounded-card border border-ink bg-paper p-5">
      <p className="font-semibold">{theme ? `Edit ${theme.name}` : "Make your own"}</p>
      <label className="mt-3 block text-sm text-muted" htmlFor="own-theme-name">
        Name
      </label>
      <input
        id="own-theme-name"
        value={name}
        maxLength={30}
        onChange={(e) => setName(e.target.value)}
        placeholder="Like Sunday morning"
        className="mt-1 w-full rounded-control bg-surface px-4 py-2.5 text-sm outline-none ring-1 ring-line focus:ring-muted"
      />
      <p className="mt-4 text-sm text-muted">Colors: the busiest jobs get the first ones. Tap one to change it.</p>
      <div className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-10">
        {colors.map((c, i) => (
          <label key={i} className="relative block aspect-square cursor-pointer overflow-hidden rounded-[12px] ring-1 ring-line transition-transform hover:scale-105" style={{ background: c }}>
            <span className="sr-only">Color {i + 1}</span>
            <input
              type="color"
              value={c}
              onChange={(e) => setColors((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </label>
        ))}
      </div>
      <span className="mt-4 flex h-4 overflow-hidden rounded-full" aria-hidden="true">
        {colors.map((c, i) => (
          <span key={i} className="flex-1" style={{ background: c }} />
        ))}
      </span>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await saveOwnTheme({ id: theme?.id, name, colors });
              if (!res.ok) return setMessage(res.message);
              onSaved();
            })
          }
          className="rounded-control bg-ink px-5 py-2.5 text-sm font-semibold text-paper disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save theme"}
        </button>
        <button type="button" onClick={onClose} className="rounded-control px-4 py-2.5 text-sm font-semibold text-muted hover:text-ink">
          Cancel
        </button>
        {theme && (
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              if (!(await confirm({ title: `Delete ${theme.name}?`, body: "Your jobs and categories keep the colors they have now.", confirmLabel: "Delete" }))) return;
              start(async () => {
                const res = await deleteOwnTheme(theme.id);
                if (!res.ok) return setMessage(res.message);
                onDeleted(theme.id);
              });
            }}
            className="ml-auto rounded-control px-4 py-2.5 text-sm font-semibold text-danger hover:underline"
          >
            Delete
          </button>
        )}
      </div>
      {message && <p className="mt-2 text-sm text-danger">{message}</p>}
    </div>
  );
}
