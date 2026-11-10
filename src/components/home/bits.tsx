"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { useBarHeight } from "./sticky";

// Small pieces shared by the home page and the category pages.

// Keeps a local copy of server data that we can change right away (e.g. after a drag),
// and resets it whenever fresh data arrives from the server.
export function useLocalCopy<T>(value: T) {
  const [prev, setPrev] = useState(value);
  const [local, setLocal] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setLocal(value);
  }
  return [local, setLocal] as const;
}

// The dark bar at the top of the page, with the Edit/Done button on the right.
// description: a short line under the title; onDescription makes it editable while editing.
export function PageHeader({
  title,
  back,
  editing,
  onToggle,
  description,
  onDescription,
  sticky = false,
}: {
  title: string;
  sticky?: boolean; // stays at the top while you scroll (the home page)
  back?: { href: string; label: string };
  editing: boolean;
  onToggle: () => void;
  description?: string | null;
  onDescription?: (next: string) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  useBarHeight(strip, sticky);
  return (
    <>
      {back && (
        <Link
          href={back.href}
          className="mb-4 inline-block text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          ← {back.label}
        </Link>
      )}
      {/* Sticky: paper above it (so nothing shows over the top), and the page scrolls away under
          the bar and its shadow, the same shadow as the other boxes. */}
      <div ref={strip} className={sticky ? "sticky top-0 z-40 -mx-3 -mt-3 mb-3 bg-paper px-3 pt-3" : ""}>
        <header className="flex items-center justify-between gap-4 rounded-card bg-accent px-5 py-4 text-accent-ink shadow-lg shadow-ink/15">
          <div className="min-w-0 flex-1">
            <h1 className="min-w-0 truncate font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
            {editing && onDescription ? (
              <InlineInput
                value={description ?? ""}
                label="Description"
                placeholder="Add a description"
                allowEmpty
                onSave={onDescription}
                className="mt-0.5 w-full text-sm text-accent-ink/80 placeholder:text-accent-ink/40 hover:border-accent-ink/25 focus:border-accent-ink/70"
              />
            ) : (
              description && <p className="mt-0.5 text-sm opacity-75">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onToggle}
            className={`shrink-0 rounded-control border px-4 py-1.5 text-sm font-semibold transition-colors ${
              editing
                ? "border-accent-ink bg-accent-ink text-accent hover:opacity-90"
                : "border-accent-ink/25 hover:bg-accent-ink/10"
            }`}
          >
            {editing ? "Done" : "Edit"}
          </button>
        </header>
      </div>
    </>
  );
}

// A text box that saves when you click away or press Enter (Escape undoes).
export function InlineInput({
  value,
  onSave,
  className,
  placeholder,
  label,
  allowEmpty,
}: {
  value: string;
  onSave: (next: string) => void;
  className?: string;
  placeholder?: string;
  label: string;
  allowEmpty?: boolean;
}) {
  return (
    <input
      key={value}
      defaultValue={value}
      placeholder={placeholder}
      aria-label={label}
      maxLength={120}
      onBlur={(e) => {
        const next = e.currentTarget.value.trim();
        if (next === value) return;
        if (!next && !allowEmpty) {
          e.currentTarget.value = value;
          return;
        }
        onSave(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.currentTarget.value = value;
          e.currentTarget.blur();
        }
      }}
      // No focus box: the underline darkens instead.
      style={{ outline: "none" }}
      className={`min-w-0 border-b-2 border-transparent bg-transparent py-1 transition-colors hover:border-line focus:border-ink ${className ?? ""}`}
    />
  );
}

export function DeleteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-8 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-paper hover:text-danger"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  );
}

// Dashed "+ Add …" card that turns into a text box when clicked.
export function AddCard({ label, onAdd }: { label: string; onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-20 items-center justify-center gap-2 rounded-card border-[1.5px] border-dashed border-line p-5 text-muted transition-colors hover:border-muted hover:text-ink"
      >
        <span className="text-xl leading-none">+</span> {label}
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
        if (name) onAdd(name);
        setOpen(false);
      }}
      className="flex min-h-20 items-center gap-2 rounded-card border-[1.5px] border-dashed border-muted p-3 pl-5"
    >
      <input
        name="name"
        autoFocus
        maxLength={60}
        placeholder="Name"
        aria-label={label}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        style={{ outline: "none" }}
        className="min-w-0 flex-1 border-b-2 border-line bg-transparent py-1 font-display text-lg font-semibold focus:border-ink"
      />
      <button type="submit" className="rounded-control bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:opacity-90">
        Add
      </button>
    </form>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-card border border-dashed border-line px-5 py-6 text-muted">{children}</p>;
}
