"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { copyLastYear, deleteResolution, saveYearNote, updateResolution } from "@/app/resolutions/actions";
import type { Resolution } from "@/lib/resolutions";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import Mascot from "@/components/ui/Mascot";

const field =
  "w-full rounded-control border border-line bg-paper px-3 py-2.5 text-ink placeholder:text-muted/70 focus:border-ink";

// The year's list: its note (optional) on top, then each resolution (reflection inside).
export default function ResolutionList({
  year,
  items,
  note,
  lastYearCount,
  focusId,
}: {
  year: number;
  items: Resolution[];
  note: string | null;
  lastYearCount: number;
  focusId?: string;
}) {
  const [copying, startCopy] = useTransition();

  return (
    <section
      aria-label={`${year} resolutions`}
      className="relative isolate mt-5 flex min-h-[24rem] flex-col overflow-clip rounded-card border-[1.5px] border-ink px-3 pb-4 pt-4 sm:px-5"
    >
      {/* Mascot: Ho-Oh, in the middle of the box's bottom edge (see Mascot.tsx to tweak). */}
      <Mascot name="ho-oh" corner="center" className="w-44 sm:w-56" />
      <YearNote key={note ?? ""} year={year} note={note} />

      {items.length === 0 ? (
        <div className="mt-3 rounded-card border border-dashed border-line px-5 py-6 text-muted">
          <p>No resolutions for {year} yet.</p>
          {lastYearCount > 0 && (
            <button
              type="button"
              disabled={copying}
              onClick={() => startCopy(() => copyLastYear(year))}
              className="mt-3 rounded-control bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {copying ? "Copying…" : `Start with ${year - 1}'s ${lastYearCount} ${lastYearCount === 1 ? "resolution" : "resolutions"}`}
            </button>
          )}
        </div>
      ) : (
        <ol className="mt-3 space-y-2.5">
          {items.map((r, i) => (
            <Item key={r.id} item={r} n={i + 1} focused={r.id === focusId} />
          ))}
        </ol>
      )}
    </section>
  );
}

// "A note for 2025" — click to write or change it.
function YearNote({ year, note }: { year: number; note: string | null }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [text, setText] = useState(note ?? "");

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            await saveYearNote(year, text);
            setEditing(false);
          });
        }}
        className="flex flex-col gap-2"
      >
        <textarea
          autoFocus
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`A note for ${year}: how the year's starting, what carried over…`}
          aria-label={`Note for ${year}`}
          style={{ outline: "none" }}
          className={`${field} resize-y`}
        />
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className="rounded-control bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:opacity-90 disabled:opacity-60">
            {pending ? "Saving…" : "Save note"}
          </button>
          <button
            type="button"
            onClick={() => {
              setText(note ?? "");
              setEditing(false);
            }}
            className="rounded-control px-3 py-2 text-sm text-muted hover:bg-surface hover:text-ink"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return note ? (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Edit the note"
      className="w-full rounded-card bg-accent/10 px-4 py-3 text-left italic text-ink/80 transition-colors hover:bg-accent/15"
    >
      <span className="whitespace-pre-line">{note}</span>
    </button>
  ) : (
    <button type="button" onClick={() => setEditing(true)} className="self-start rounded-control px-2 py-1 text-sm text-muted transition-colors hover:bg-surface hover:text-ink">
      + Note for {year}
    </button>
  );
}

// Folded by default: number + resolution. Click it to open the reflection (if there is one).
function Item({ item, n, focused }: { item: Resolution; n: number; focused: boolean }) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(focused); // a search result opens itself
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const ref = useRef<HTMLLIElement>(null);
  const hasReflection = Boolean(item.reflection);

  // Arrived from a search result: scroll to it while it flashes.
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focused]);

  async function remove() {
    const ok = await confirm({ title: `Delete "${item.title}"?`, body: "It'll be removed for good, with its reflection.", confirmLabel: "Delete" });
    if (ok) startTransition(() => deleteResolution(item.id));
  }

  if (editing) return <ItemEditor item={item} n={n} onDone={() => setEditing(false)} />;

  return (
    <li
      ref={ref}
      className={`group flex gap-3 rounded-card bg-surface px-3 py-3 transition-opacity sm:gap-4 sm:px-4 ${pending ? "opacity-40" : ""} ${
        focused ? "flash" : ""
      }`}
    >
      <span aria-hidden="true" className="num w-6 shrink-0 text-right font-display text-xl font-semibold leading-7 text-accent">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          disabled={!hasReflection}
          className="flex w-full items-start gap-2 text-left disabled:cursor-default"
        >
          <span className="min-w-0 flex-1 break-words text-[17px] font-medium leading-7 text-ink/80">{item.title}</span>
          {hasReflection && (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className={`mt-[7px] shrink-0 text-muted/70 transition-transform ${open ? "rotate-180" : ""}`}
            >
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
        {open && hasReflection && (
          // The reflection: under a thin line, in its own lighter voice.
          <p className="mt-2 whitespace-pre-line break-words border-t border-accent/20 pt-2 leading-relaxed text-ink/75">{item.reflection}</p>
        )}
      </div>

      <div className="-mr-1 -mt-0.5 flex shrink-0 items-start">
        <IconButton label={`Edit "${item.title}"`} disabled={pending} onClick={() => setEditing(true)}>
          <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />
        </IconButton>
        <IconButton label={`Delete "${item.title}"`} disabled={pending} onClick={remove} danger>
          <path d="M6 6l12 12M18 6L6 18" />
        </IconButton>
      </div>
    </li>
  );
}

// Edit the resolution and its reflection.
function ItemEditor({ item, n, onDone }: { item: Resolution; n: number; onDone: () => void }) {
  const [title, setTitle] = useState(item.title);
  const [reflection, setReflection] = useState(item.reflection ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <li className="flex gap-3 rounded-card bg-surface px-3 py-3 ring-1 ring-line sm:gap-4 sm:px-4">
      <span aria-hidden="true" className="num w-6 shrink-0 pt-2.5 text-right font-display text-xl font-semibold leading-snug text-accent">
        {n}
      </span>
      <form
        className="flex min-w-0 flex-1 flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            try {
              await updateResolution(item.id, title, reflection);
              onDone();
            } catch (err) {
              setError((err as Error).message);
            }
          });
        }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={300}
          aria-label="Resolution"
          style={{ outline: "none" }}
          className={`${field} font-semibold`}
        />
        <textarea
          autoFocus={!item.reflection}
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
          rows={4}
          maxLength={5000}
          placeholder="Reflection"
          aria-label="Reflection"
          style={{ outline: "none" }}
          className={`${field} resize-y leading-relaxed`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending} className="rounded-control bg-accent px-5 py-2.5 font-semibold text-accent-ink hover:opacity-90 disabled:opacity-60">
            {pending ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onDone} className="rounded-control px-4 py-2.5 text-muted hover:bg-paper hover:text-ink">
            Cancel
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </form>
    </li>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid size-8 place-items-center rounded-control text-muted opacity-50 transition hover:bg-paper disabled:pointer-events-none disabled:opacity-20 group-hover:text-black group-hover:opacity-100 ${
        danger ? "hover:text-danger!" : ""
      }`}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}
