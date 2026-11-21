"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { readUndo, readUndoServer, redo, subscribeUndo, undo } from "@/mbm/undo";

// ↶ ↷ for the Day page's entry changes (also ⌘Z / ⇧⌘Z, or Ctrl on Windows). Greyed out when
// there's nothing to undo or redo; hovering says what it'd undo.
export default function UndoButtons() {
  const state = useSyncExternalStore(subscribeUndo, readUndo, readUndoServer);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const go = async (which: "undo" | "redo") => {
    setError(null);
    const res = await (which === "undo" ? undo() : redo());
    if (res.ok) router.refresh();
    else setError(res.message);
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return; // (typing: the box's own undo)
      e.preventDefault();
      void go(e.shiftKey ? "redo" : "undo");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const btn = "grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink disabled:pointer-events-none disabled:opacity-30";
  return (
    <div className="relative flex items-center gap-0.5">
      <button type="button" onClick={() => go("undo")} disabled={!state.undo || state.busy} className={btn} aria-label={state.undo ? `Undo: ${state.undo}` : "Nothing to undo"} title={state.undo ? `Undo: ${state.undo} (⌘Z)` : "Nothing to undo"}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
        </svg>
      </button>
      <button type="button" onClick={() => go("redo")} disabled={!state.redo || state.busy} className={btn} aria-label={state.redo ? `Redo: ${state.redo}` : "Nothing to redo"} title={state.redo ? `Redo: ${state.redo} (⇧⌘Z)` : "Nothing to redo"}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 14 5-5-5-5" />
          <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
        </svg>
      </button>
      {error && (
        <p role="alert" className="absolute right-0 top-full z-30 mt-1 w-56 rounded-control bg-paper px-3 py-2 text-xs text-danger shadow-lg ring-1 ring-line">
          {error}
        </p>
      )}
    </div>
  );
}
