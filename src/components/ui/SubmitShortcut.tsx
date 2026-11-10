"use client";

import { useEffect } from "react";

// ⌘↵ / Ctrl+↵ anywhere you're typing: submits it.
//   - in a form (adding an entry, a note, an item…): sends the form, the same as its button;
//   - anywhere else (a name or note you edit in place, a todo): finishes editing, which saves it.
// Handy in boxes where Enter just makes a new line.
export default function SubmitShortcut() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey) || e.defaultPrevented || e.isComposing) return;
      const el = e.target as HTMLElement | null;
      if (!el || !(el.matches("input, textarea, select") || el.isContentEditable)) return;
      e.preventDefault();
      const form = el.closest("form");
      if (form) {
        // Through the form's own submit button (some forms have several actions); if that button is
        // greyed out (nothing typed yet), nothing happens, same as clicking it.
        const buttons = [...form.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button[type="submit"], button:not([type]), input[type="submit"]')];
        const button = buttons.find((b) => !b.disabled);
        if (buttons.length && !button) return;
        form.requestSubmit(button);
      } else {
        el.blur();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
