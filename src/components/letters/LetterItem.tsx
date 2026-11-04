"use client";

import { useState, useTransition, type ReactNode } from "react";
import { deleteLetter } from "@/app/letters/actions";
import type { Letter } from "@/lib/letters";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import LetterForm from "./LetterForm";
import { longDate } from "./dates";

// One letter, folded to its subject + dates. Click to read; pencil to edit; × to delete.
export default function LetterItem({ letter, today, onChanged }: { letter: Letter; today: string; onChanged?: () => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();

  async function remove() {
    const ok = await confirm({ title: "Delete this letter?", body: `"${letter.subject}" will be gone for good.`, confirmLabel: "Delete" });
    if (ok)
      startTransition(async () => {
        await deleteLetter(letter.id);
        onChanged?.();
      });
  }

  if (editing) {
    return (
      <li className="rounded-card bg-surface p-3 ring-1 ring-line sm:p-4">
        <LetterForm
          today={today}
          letter={letter}
          onDone={() => {
            setEditing(false);
            onChanged?.();
          }}
        />
      </li>
    );
  }

  return (
    <li className={`group rounded-card bg-surface/80 px-3 py-2.5 transition-opacity sm:px-4 ${pending ? "opacity-40" : ""}`}>
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-w-0 flex-1 items-start gap-2 text-left">
          <span className="min-w-0 flex-1">
            <span className="block break-words font-semibold leading-snug text-ink">{letter.subject}</span>
            <span className="num mt-0.5 block text-xs text-muted">
              {letter.written_on ? `Written ${longDate(letter.written_on)} · ` : ""}
              {letter.deliver_on > today ? "arrives" : "arrived"} {longDate(letter.deliver_on)}
            </span>
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`mt-1 shrink-0 text-muted/70 transition-transform ${open ? "rotate-180" : ""}`}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="-my-1 -mr-1 flex shrink-0">
          <IconButton label="Edit" disabled={pending} onClick={() => setEditing(true)}>
            <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />
          </IconButton>
          <IconButton label="Delete" danger disabled={pending} onClick={remove}>
            <path d="M6 6l12 12M18 6L6 18" />
          </IconButton>
        </div>
      </div>
      {open && (
        <div className="dream-text mt-2 break-words border-t border-accent/20 pt-2.5 leading-relaxed text-ink" dangerouslySetInnerHTML={{ __html: letter.body }} />
      )}
    </li>
  );
}

function IconButton({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`grid size-8 place-items-center rounded-control text-muted opacity-50 transition hover:bg-paper group-hover:text-black group-hover:opacity-100 ${danger ? "hover:text-danger!" : ""}`}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}
