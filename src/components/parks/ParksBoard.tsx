"use client";

import { useEffect, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { deletePark, removeParkPhoto, setVisited, uploadParkPhoto } from "@/app/parks/actions";
import { shrinkImage } from "@/lib/shrink-image";
import type { Park } from "@/lib/parks";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useIsStuck } from "@/components/ui/useIsStuck";
import ParkForm from "./ParkForm";
import Mascot from "@/components/ui/Mascot";

const VEIL_MS = 620;
// The box's smallest height on wide screens: the column title (~3.5rem) + 8 cards (88px each with
// 8px gaps ≈ 47.5rem) + bottom padding. Raise/lower to show more/fewer parks before scrolling.
const MIN_8 = "lg:min-h-[42rem]"; // same slide timing as the unsuspicious documents' writing box

// Which borders each piece draws. Phones: the columns stack (Visited on top). Wide screens: side by
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
type Mode = "both" | "visited" | "notYet"; // which column(s) are open

// One black-bordered box, two columns: Visited (left) and Not yet (right). Folding one into a slim
// strip widens the other; the strip's button brings both back. Each column scrolls inside itself,
// and the box is always tall enough to show at least 8 parks (more on tall screens).
// Official national parks first, then your own ("Other").
export default function ParksBoard({ visited, notYet, focusId }: { visited: Park[]; notYet: Park[]; focusId?: string }) {
  const [mode, setMode] = useState<Mode>("both");

  // Picked a park from search: make sure both columns are open so it can be seen.
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
  const width = (side: "visited" | "notYet"): string =>
    mode === "both" ? "50%" : mode === side ? "calc(100% - 4.5rem)" : "4.5rem";

  return (
    <section
      aria-label="National parks"
      // Height: fills the rest of the screen, but never less than ~8 cards (MIN_8). On phones each
      // column is its own fixed height instead. The black border is drawn by the pieces inside
      // (see EDGES), so the pinned titles keep the top edge and every line meets exactly.
      className={`relative isolate mt-5 flex flex-col overflow-clip rounded-card lg:flex-1 lg:basis-0 lg:flex-row ${MIN_8}`}
    >
      {/* Mascots: pinned to the board's bottom corners, behind the parks; they stay put while
          the lists scroll (see Mascot.tsx to tweak). */}
      <Mascot name="tapu-bulu" corner="left" />
      <Mascot name="torterra" corner="right" />
      <Column
        title="Visited"
        parks={visited}
        open={mode !== "notYet"}
        width={width("visited")}
        side="left"
        empty="None yet. Mark a park as visited on the right."
        focusId={focusId}
        onFold={() => setMode("notYet")}
        onUnfold={() => setMode("both")}
      />
      <Column
        title="Not yet"
        parks={notYet}
        open={mode !== "visited"}
        width={width("notYet")}
        side="right"
        empty="You've been to all of them!"
        focusId={focusId}
        onFold={() => setMode("visited")}
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
  parks,
  open,
  width,
  side,
  empty,
  focusId,
  onFold,
  onUnfold,
}: {
  title: string;
  parks: Park[];
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
  const official = parks.filter((p) => !p.custom);
  const other = parks.filter((p) => p.custom);
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
            aria-label={`Show ${title.toLowerCase()} (${official.length})`}
            title={`Show ${title.toLowerCase()}`}
            className="flex items-center gap-2 rounded-control bg-accent px-4 py-2.5 font-semibold text-accent-ink transition-opacity hover:opacity-90 lg:size-11 lg:justify-center lg:p-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d={unfoldPath} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="lg:sr-only">Show {title.toLowerCase()}</span>
          </button>
          <p className="whitespace-nowrap text-sm text-muted lg:rotate-180 lg:[writing-mode:vertical-rl]">
            {title} · {official.length}
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
                <Count official={official.length} other={other.length} />
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
              {official.length === 0 ? (
                <p className="mt-1 rounded-card border border-dashed border-line px-5 py-6 text-muted">{empty}</p>
              ) : (
                <ul className="space-y-2">
                  {official.map((p) => (
                    <ParkItem key={p.id} park={p} focused={p.id === focusId} />
                  ))}
                </ul>
              )}
              {/* Your own parks (not official national parks): their own little section. */}
              {other.length > 0 && (
                <>
                  <h3 className="mt-5 flex items-baseline justify-between px-1 pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                    <span>Other</span>
                    <span className="font-normal normal-case tracking-normal">{other.length}</span>
                  </h3>
                  <ul className="space-y-2">
                    {other.map((p) => (
                      <ParkItem key={p.id} park={p} focused={p.id === focusId} />
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// "19" for official parks, then "+4 other" (your own parks) set apart, so they never mix.
function Count({ official, other }: { official: number; other: number }) {
  return (
    <p className="text-sm text-muted">
      <span className="num font-semibold text-ink/80">{official}</span>
      {other > 0 && <span className="ml-1.5 rounded-full bg-surface px-2 py-0.5 text-xs">+{other} other</span>}
    </p>
  );
}

function ParkItem({ park, focused }: { park: Park; focused: boolean }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focused]);

  async function remove() {
    const ok = await confirm({
      title: `Delete ${park.name}?`,
      body: `It'll be removed from your list for good${park.photo_path ? ", with its photo" : ""}.`,
      confirmLabel: "Delete",
    });
    if (ok) startTransition(() => deletePark(park.id));
  }

  if (editing) {
    return (
      <li className="rounded-card bg-surface p-3 ring-1 ring-line">
        <ParkForm park={park} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    // Card size: py-3 + the 4rem (size-16) photo tile.
    <li
      ref={ref}
      className={`group flex items-center gap-4 rounded-card bg-surface/80 px-3 py-3 transition-opacity ${pending ? "opacity-40" : ""} ${
        focused ? "flash" : ""
      }`}
    >
      {/* Visited: your photo (or a spot to add one). Not yet: the park's initials. */}
      {park.visited ? <PhotoTile park={park} /> : <Initials name={park.name} />}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[17px] font-medium text-ink">
          <span className="min-w-0 truncate">{park.name}</span>
        </p>
        {park.note && <p className="mt-0.5 break-words text-sm leading-snug text-muted">{park.note}</p>}
      </div>
      <div className="-my-1 flex shrink-0">
        <IconButton
          label={park.visited ? `Move ${park.name} to not yet` : `Mark ${park.name} as visited`}
          disabled={pending}
          onClick={() => startTransition(() => setVisited(park.id, !park.visited))}
        >
          {park.visited ? (
            <path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </IconButton>
        <IconButton label={`Edit ${park.name}`} disabled={pending} onClick={() => setEditing(true)}>
          <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </IconButton>
        <IconButton label={`Delete ${park.name}`} disabled={pending} onClick={remove} danger>
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </IconButton>
      </div>
    </li>
  );
}

// A not-yet park: its initials in a circle (same size as the photo tiles).
function Initials({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return (
    <span aria-hidden="true" className="grid size-16 shrink-0 place-items-center rounded-full bg-line font-display text-lg font-semibold text-muted">
      {initials || "•"}
    </span>
  );
}

// A visited park's photo: a rounded square (same corners as the cards). No photo yet: a dashed
// "+ Photo" tile that opens your files. Click a photo to see it big, change it or remove it.
function PhotoTile({ park }: { park: Park }) {
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
    const res = await uploadParkPhoto(park.id, form);
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
      {park.photo ? (
        <button
          type="button"
          onClick={() => setViewing(true)}
          aria-label={`See your photo from ${park.name}`}
          title="See photo"
          className="block size-16 overflow-hidden rounded-card ring-1 ring-line transition-opacity hover:opacity-90"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- temporary private link */}
          <img src={park.photo} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label={`Add a photo from ${park.name}`}
          title="Add a photo"
          className="flex size-16 flex-col items-center justify-center gap-0.5 rounded-card border-[1.5px] border-dashed border-muted/50 text-muted transition-colors hover:border-accent hover:text-accent"
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

      {viewing && park.photo &&
        createPortal(
          <PhotoViewer
            name={park.name}
            src={park.photo}
            busy={busy}
            onClose={() => setViewing(false)}
            onChange={() => fileRef.current?.click()}
            onRemove={async () => {
              setBusy(true);
              await removeParkPhoto(park.id);
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
    <div role="dialog" aria-label={`Photo from ${name}`} className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4" onClick={onClose}>
      <div className="panel-pop flex max-h-full max-w-3xl flex-col gap-3 rounded-card bg-paper p-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element -- temporary private link */}
        <img src={src} alt={`Your photo from ${name}`} className="max-h-[70dvh] min-h-0 w-auto rounded-control object-contain" />
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
