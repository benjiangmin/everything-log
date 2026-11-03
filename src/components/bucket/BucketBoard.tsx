"use client";

import { useEffect, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { deleteBucketItem, removeBucketPhoto, setBucketDone, uploadBucketPhoto } from "@/app/bucket/actions";
import { shrinkImage } from "@/lib/shrink-image";
import type { BucketItem } from "@/lib/bucket";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useIsStuck } from "@/components/ui/useIsStuck";
import BucketForm from "./BucketForm";
import Mascot from "@/components/ui/Mascot";

const VEIL_MS = 620;
// The box's smallest height on wide screens. Raise/lower to show more/fewer items before scrolling.
const MIN_8 = "lg:min-h-[36rem]";

// Which borders each piece draws. Phones: the columns stack (Not yet on top). Wide screens: side by
// side, with a thin line between them. Each column's title piece and list piece are siblings of the
// same width, so their side borders line up exactly (no 1px jog).
const EDGES = {
  left: {
    head: "rounded-t-card border-x-[1.5px] border-t-[1.5px] border-ink lg:rounded-tr-none lg:border-r-0",
    body: "border-x-[1.5px] border-ink lg:rounded-bl-card lg:border-b-[1.5px] lg:border-r-0",
    strip: "rounded-t-card border-x-[1.5px] border-t-[1.5px] border-ink lg:rounded-r-none lg:rounded-l-card lg:border-b-[1.5px] lg:border-r-0",
  },
  right: {
    head: "border-x-[1.5px] border-t border-ink border-t-line lg:rounded-tr-card lg:border-l lg:border-t-[1.5px] lg:border-l-line lg:border-t-ink",
    body: "rounded-b-card border-x-[1.5px] border-b-[1.5px] border-ink lg:rounded-bl-none lg:border-l lg:border-l-line",
    strip:
      "rounded-b-card border-x-[1.5px] border-b-[1.5px] border-t border-ink border-t-line lg:rounded-l-none lg:rounded-r-card lg:border-l lg:border-t-[1.5px] lg:border-l-line lg:border-t-ink",
  },
};
type Mode = "both" | "todo" | "done"; // which column(s) are open

// The same box as National parks: Not yet (left) and Done (right). Folding one into a slim strip
// widens the other; the strip's button brings both back. Each column scrolls inside itself.
// Click an item to see its details (note, photo, link).
export default function BucketBoard({ todo, done, focusId }: { todo: BucketItem[]; done: BucketItem[]; focusId?: string }) {
  const [mode, setMode] = useState<Mode>("both");

  // Picked from search: make sure both columns are open so it can be seen.
  const [seenFocus, setSeenFocus] = useState(focusId);
  if (focusId !== seenFocus) {
    setSeenFocus(focusId);
    if (focusId) setMode("both");
  }

  // While the columns slide, an oat veil covers them so you don't see the text reflow.
  const [veil, setVeil] = useState(0);
  const [lastMode, setLastMode] = useState(mode);
  if (lastMode !== mode) {
    setLastMode(mode);
    setVeil((v) => v + 1);
  }
  useEffect(() => {
    if (!veil) return;
    const t = setTimeout(() => setVeil(0), VEIL_MS);
    return () => clearTimeout(t);
  }, [veil]);

  // Column widths (wide screens). Strip: 4.5rem.
  const width = (side: "todo" | "done"): string => (mode === "both" ? "50%" : mode === side ? "calc(100% - 4.5rem)" : "4.5rem");

  return (
    <section aria-label="Bucket list" className={`relative isolate mt-5 flex flex-col overflow-clip rounded-card lg:flex-1 lg:basis-0 lg:flex-row ${MIN_8}`}>
      {/* Mascots: pinned to the board's bottom corners, behind the items; they stay put while
          the lists scroll (see Mascot.tsx to tweak). */}
      <Mascot name="dragonite" corner="left" />
      <Mascot name="lapras" corner="right" />
      <Column
        title="Not yet"
        items={todo}
        open={mode !== "done"}
        width={width("todo")}
        side="left"
        empty="Nothing left. Time to dream bigger."
        focusId={focusId}
        onFold={() => setMode("done")}
        onUnfold={() => setMode("both")}
      />
      <Column
        title="Done"
        items={done}
        open={mode !== "todo"}
        width={width("done")}
        side="right"
        empty="Nothing checked off yet."
        focusId={focusId}
        onFold={() => setMode("todo")}
        onUnfold={() => setMode("both")}
      />
      {/* The veil (wide screens): covers the box while the columns slide. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 z-20 hidden rounded-[16.5px] bg-surface transition-opacity ease-out motion-reduce:hidden lg:block ${
          veil > 0 ? "opacity-100 duration-150" : "opacity-0 duration-300"
        }`}
      />
    </section>
  );
}

function Column({
  title,
  items,
  open,
  width,
  side,
  empty,
  focusId,
  onFold,
  onUnfold,
}: {
  title: string;
  items: BucketItem[];
  open: boolean;
  width: string;
  side: "left" | "right";
  empty: string;
  focusId?: string;
  onFold: () => void;
  onUnfold: () => void;
}) {
  const [scrolled, setScrolled] = useState(false); // the list has scrolled inside the box
  const [headRef, stuck] = useIsStuck<HTMLDivElement>(); // the title is pinned to the page
  const edges = EDGES[side];
  // Arrows point the way the column folds (left column folds left, right column folds right).
  const foldPath = side === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7";
  const unfoldPath = side === "left" ? "M9 5l7 7-7 7" : "M15 5l-7 7 7 7";

  return (
    <div
      style={{ "--w": width } as CSSProperties}
      className={`relative z-[1] flex min-h-0 flex-col transition-[width] delay-150 duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none lg:w-[var(--w)] ${
        open ? "h-[75dvh] min-h-[24rem] lg:h-auto lg:min-h-0" : ""
      }`}
    >
      {!open ? (
        // Folded: a slim strip (wide screens) or a bar (phones).
        <div
          className={`panel-in flex items-center justify-between gap-3 bg-surface p-3 lg:h-full lg:flex-col lg:justify-start lg:gap-5 lg:px-0 lg:py-4 ${edges.strip}`}
        >
          <button
            type="button"
            onClick={onUnfold}
            aria-label={`Show ${title.toLowerCase()} (${items.length})`}
            title={`Show ${title.toLowerCase()}`}
            className="flex items-center gap-2 rounded-control bg-accent px-4 py-2.5 font-semibold text-accent-ink transition-opacity hover:opacity-90 lg:size-11 lg:justify-center lg:p-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d={unfoldPath} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="lg:sr-only">Show {title.toLowerCase()}</span>
          </button>
          <p className="whitespace-nowrap text-sm text-muted lg:rotate-180 lg:[writing-mode:vertical-rl]">
            {title} · {items.length}
          </p>
        </div>
      ) : (
        <div className="panel-in flex min-h-0 flex-1 flex-col">
          {/* The title pins just under the page's title/search bar when the page scrolls, carrying the
              box's top edge with it, and shows a soft shadow under itself once pinned (or when the list
              has scrolled). The outer strip is paper so nothing peeks past its rounded corner.
              data-stick-under: once pinned, the page bar's own fade hides so the edge stays crisp. */}
          <div ref={headRef} data-stick-under className="sticky top-[var(--sticky-top,0px)] z-10 shrink-0 bg-paper">
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-[1.5px] top-full h-6 bg-gradient-to-b from-paper to-transparent transition-opacity duration-200 ${
                stuck || scrolled ? "opacity-100" : "opacity-0"
              }`}
            />
            <div className={`flex items-center justify-between gap-3 px-5 pb-2 pt-4 sm:px-6 ${edges.head}`}>
              <h2 className="font-display text-xl font-semibold">{title}</h2>
              <div className="flex items-center gap-1">
                <p className="num text-sm font-semibold text-ink/80">{items.length}</p>
                <button
                  type="button"
                  onClick={onFold}
                  aria-label={`Fold away ${title.toLowerCase()}`}
                  title="Fold away"
                  className="grid size-8 place-items-center rounded-control text-muted transition-colors hover:bg-surface hover:text-ink"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d={foldPath} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          {/* The scrolling part, pinned to the column (absolute inset-0) so a long list scrolls inside
              instead of making the box taller. */}
          <div className={`relative min-h-0 flex-1 ${edges.body}`}>
            <div
              onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
              className={`absolute inset-0 overflow-y-auto px-3 pb-4 sm:px-4 ${
                side === "left" ? "lg:rounded-bl-[16.5px]" : "rounded-b-[16.5px] lg:rounded-bl-none"
              }`}
            >
              {items.length === 0 ? (
                <p className="mt-1 rounded-card border border-dashed border-line px-5 py-6 text-muted">{empty}</p>
              ) : (
                <ul className="space-y-2">
                  {items.map((i) => (
                    <Item key={i.id} item={i} focused={i.id === focusId} />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// One item. Closed: a check button + the name (+ a small photo when done). Click the row to open it:
// the note, the photo (add / see / change it), the link, and edit / delete.
function Item({ item, focused }: { item: BucketItem; focused: boolean }) {
  const [open, setOpen] = useState(focused);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const ref = useRef<HTMLLIElement>(null);

  // Picked from search while already on the page: open it.
  const [seenFocus, setSeenFocus] = useState(focused);
  if (focused !== seenFocus) {
    setSeenFocus(focused);
    if (focused) setOpen(true);
  }
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focused]);

  async function remove() {
    const ok = await confirm({
      title: `Delete "${item.name}"?`,
      body: `It'll be removed from your bucket list for good${item.photo_path ? ", with its photo" : ""}.`,
      confirmLabel: "Delete",
    });
    if (ok) startTransition(() => deleteBucketItem(item.id));
  }

  if (editing) {
    return (
      <li className="rounded-card bg-surface p-3 ring-1 ring-line">
        <BucketForm item={item} onDone={() => setEditing(false)} />
      </li>
    );
  }

  const hasDetails = Boolean(item.note || item.link || item.done);
  return (
    <li
      ref={ref}
      className={`group rounded-card bg-surface/80 transition-opacity ${pending ? "opacity-40" : ""} ${focused ? "flash" : ""}`}
    >
      <div className="flex items-center gap-3 px-3 py-3">
        {/* Check it off / put it back. */}
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => setBucketDone(item.id, !item.done))}
          aria-label={item.done ? `Move "${item.name}" back to not yet` : `Mark "${item.name}" as done`}
          title={item.done ? "Move back to not yet" : "Done it!"}
          className={`grid size-7 shrink-0 place-items-center rounded-full border-[1.5px] transition-colors ${
            item.done
              ? "border-accent bg-accent text-accent-ink hover:opacity-80"
              : "border-muted/60 text-transparent hover:border-accent hover:text-accent"
          }`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {/* The name: click to open/close the details. */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className={`min-w-0 flex-1 break-words text-[17px] font-medium ${item.done ? "text-ink/80" : "text-ink"}`}>{item.name}</span>
          {!open && item.photo && (
            // eslint-disable-next-line @next/next/no-img-element -- temporary private link
            <img src={item.photo} alt="" loading="lazy" className="size-9 shrink-0 rounded-control object-cover ring-1 ring-line" />
          )}
          {!open && hasDetails && (item.note || item.link) && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-label="Has details" className="shrink-0 text-muted">
              <path d="M5 5h14v10H9l-4 4V5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          )}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="flex gap-4 border-t border-line px-3 pb-3 pt-3">
          {/* Done items: the photo (or a spot to add one). */}
          {item.done && <PhotoTile item={item} />}
          <div className="min-w-0 flex-1">
            {item.note ? (
              <p className="whitespace-pre-line break-words leading-relaxed text-ink/90">{item.note}</p>
            ) : (
              <p className="text-sm text-muted">No notes yet.</p>
            )}
            {item.link && (
              <a
                href={item.link}
                target={item.link.startsWith("/") ? undefined : "_blank"}
                rel="noreferrer"
                className="mt-2 inline-block text-sm font-semibold text-accent underline underline-offset-2 hover:opacity-80"
              >
                {item.link.startsWith("/") ? "Open page →" : "Link ↗"}
              </a>
            )}
          </div>
          <div className="-mr-1 -mt-1 flex shrink-0 items-start">
            <IconButton label={`Edit ${item.name}`} disabled={pending} onClick={() => setEditing(true)}>
              <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </IconButton>
            <IconButton label={`Delete ${item.name}`} disabled={pending} onClick={remove} danger>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </IconButton>
          </div>
        </div>
      )}
    </li>
  );
}

// A done item's photo: a rounded square (same corners as the cards). No photo yet: a dashed
// "+ Photo" tile that opens your files. Click a photo to see it big, change it or remove it.
function PhotoTile({ item }: { item: BucketItem }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", await shrinkImage(file));
    const res = await uploadBucketPhoto(item.id, form);
    setBusy(false);
    if (!res.ok) setError(res.message);
    else setViewing(false);
  }

  const input = (
    <input
      ref={fileRef}
      type="file"
      accept="image/*"
      className="sr-only"
      onChange={(e) => {
        upload(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );

  return (
    <div className="relative shrink-0">
      {input}
      {item.photo ? (
        <button
          type="button"
          onClick={() => setViewing(true)}
          aria-label={`See your photo: ${item.name}`}
          title="See photo"
          className="block size-24 overflow-hidden rounded-card ring-1 ring-line transition-opacity hover:opacity-90"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- temporary private link */}
          <img src={item.photo} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label={`Add a photo: ${item.name}`}
          title="Add a photo"
          className="flex size-24 flex-col items-center justify-center gap-0.5 rounded-card border-[1.5px] border-dashed border-muted/50 text-muted transition-colors hover:border-accent hover:text-accent"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="6" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="M8.5 6l1.5-2.5h4L15.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
          <span className="text-[10px] font-semibold uppercase tracking-wide">Photo</span>
        </button>
      )}
      {busy && (
        <span className="absolute inset-0 grid place-items-center rounded-card bg-paper/80">
          <span className="size-5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" aria-label="Uploading" />
        </span>
      )}
      {error && (
        <p role="alert" className="absolute left-0 top-full z-10 mt-1 w-48 rounded-control bg-paper px-2 py-1 text-xs text-danger shadow">
          {error}
        </p>
      )}

      {viewing && item.photo &&
        createPortal(
          <PhotoViewer
            name={item.name}
            src={item.photo}
            busy={busy}
            onClose={() => setViewing(false)}
            onChange={() => fileRef.current?.click()}
            onRemove={async () => {
              setBusy(true);
              await removeBucketPhoto(item.id);
              setBusy(false);
              setViewing(false);
            }}
          />,
          document.body,
        )}
    </div>
  );
}

// The photo, big, over the page. Escape / clicking outside closes it.
function PhotoViewer({
  name,
  src,
  busy,
  onClose,
  onChange,
  onRemove,
}: {
  name: string;
  src: string;
  busy: boolean;
  onClose: () => void;
  onChange: () => void;
  onRemove: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-label={`Photo: ${name}`} className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4" onClick={onClose}>
      <div className="panel-pop flex max-h-full max-w-3xl flex-col gap-3 rounded-card bg-paper p-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element -- temporary private link */}
        <img src={src} alt={`Your photo: ${name}`} className="max-h-[70dvh] min-h-0 w-auto rounded-control object-contain" />
        <div className="flex items-center gap-2">
          <p className="mr-auto font-display font-semibold">{name}</p>
          <button
            type="button"
            disabled={busy}
            onClick={onRemove}
            className="rounded-control px-3 py-2 text-sm text-muted transition-colors hover:bg-surface hover:text-danger disabled:opacity-50"
          >
            Remove
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onChange}
            className="rounded-control px-3 py-2 text-sm text-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-50"
          >
            {busy ? "Uploading…" : "Change"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-control bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:opacity-90"
          >
            Done
          </button>
        </div>
      </div>
    </div>
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
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`grid size-8 place-items-center rounded-control text-muted opacity-50 transition hover:bg-paper group-hover:text-black group-hover:opacity-100 ${
        danger ? "hover:text-danger!" : ""
      }`}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}
