"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { localNow } from "@/lib/month";

// A drag-and-drop board shared by the Games, Anime and Goals pages.
//
// Default layout (one black-bordered box):
//   ┌──────────────────────┬──────────────┐
//   │ Completed            │ In progress  │
//   │ (wide: cards in two  ├──────────────┤
//   │  columns)            │ Stopped      │
//   ├──────────────────────┴──────────────┤
//   │ Backlog / Plan to watch (one row)   │
//   └─────────────────────────────────────┘
// Or pass `columns` for equal columns side by side (Goals: Yet to start | In progress | Completed),
// with the leftover status as the bottom row (Dropped).
// Each area scrolls inside itself. Drag a card to another area to change its status.

export type Status = "completed" | "playing" | "stopped" | "backlog";
export type BoardItem = { id: string; title: string; note: string | null; status: Status };

export type BoardConfig<T extends BoardItem> = {
  id: string; // fixed name for the drag area (keeps server and browser in sync)
  labels: Record<Status, string>; // e.g. { playing: "In progress" } or { playing: "Watching" }
  emptyBottomRow: string; // shown when the bottom row is empty
  sort: (status: Status) => (a: T, b: T) => number;
  // Optional: the date on the left of a card ("8/11/26"); leave out for no date column.
  leftDate?: (item: T) => string | null;
  // Optional: a line shown when a card is open (e.g. "Dec 19, 2025 – Jan 3, 2026 · 16 days").
  detail?: (item: T) => string;
  // Optional: a small label after the title (e.g. "Movie").
  tag?: (item: T) => string | null;
  // Optional: the cover picture (Games / Anime). Boards with covers show a plain tile when there's none.
  cover?: (item: T) => string | null;
  // What changes when a card is dropped somewhere else (shown right away, before the server answers).
  moved: (item: T, to: Status, today: string) => T;
  onMove: (item: T, to: Status, today: string) => Promise<void>;
  onDelete: (item: T) => Promise<void>;
  editor: (item: T, done: () => void) => ReactNode; // the edit form, shown inside the card
  // Optional: equal columns in this order (left to right); the status not listed becomes the bottom row.
  columns?: Status[];
  // Optional: what an open card shows under its title (instead of the plain note). Return null for nothing.
  body?: (item: T) => ReactNode | null;
  // Mascots pinned to a corner of an area (trimmed by it). See the className for size/position.
  mascots?: Partial<Record<Status, { src: string; className: string }>>;
};

// The shortest the board gets on wide screens, so each area shows ~6 cards before it scrolls inside:
// an area = title (3.25rem) + 6 cards (40px each + 8px gaps ≈ 18.25rem) ≈ 21.5rem; the bottom row ≈ 6.5rem.
//   split   (Games, Anime): two areas stacked on the right → 2 × 21.5 + 6.5 = 49.5rem
//   columns (Goals):        one area per column            →     21.5 + 6.5 = 28rem
// Raise/lower these to show more/fewer cards.
const MIN_HEIGHT = { split: "md:min-h-[49.5rem]", columns: "md:min-h-[28rem]" };

function todayKey() {
  const d = localNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Keeps a local copy of the server's items so a drag shows instantly; resets when fresh data arrives.
function useLocalCopy<V>(value: V) {
  const [prev, setPrev] = useState(value);
  const [local, setLocal] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setLocal(value);
  }
  return [local, setLocal] as const;
}

export default function Board<T extends BoardItem>({
  items,
  focusId,
  config,
}: {
  items: Record<Status, T[]>;
  focusId?: string;
  config: BoardConfig<T>;
}) {
  const [board, setBoard] = useLocalCopy(items);
  const [dragging, setDragging] = useState<T | null>(null);
  const [, startTransition] = useTransition();

  // Mouse: drag after moving 6px (a click still opens the card). Touch: press and hold briefly
  // (a swipe still scrolls). Keyboard: Space to pick up, arrows, Space to drop.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] } }),
  );

  function onDragStart(e: DragStartEvent) {
    setDragging((e.active.data.current?.item as T) ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const item = e.active.data.current?.item as T | undefined;
    const to = e.over?.id as Status | undefined;
    if (!item || !to || to === item.status) return;
    const today = todayKey();
    const next = config.moved(item, to, today);
    setBoard((b) => ({
      ...b,
      [item.status]: b[item.status].filter((x) => x.id !== item.id),
      [to]: [...b[to], next].sort(config.sort(to)),
    }));
    startTransition(() => config.onMove(item, to, today));
  }

  const ALL: Status[] = ["completed", "playing", "stopped", "backlog"];
  const bottom: Status = config.columns ? (ALL.find((s) => !config.columns!.includes(s)) ?? "backlog") : "backlog";

  const card = (item: T, floating = false) => (
    <Card key={item.id} item={item} focused={item.id === focusId} config={config} floating={floating} />
  );

  return (
    <DndContext id={config.id} sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      {/* The black box. Wide screens: fills the rest of the screen and never grows with the number of
          items. Short screens: the box never gets shorter than "every area fits ~6 cards" (MIN_HEIGHT
          below), so the page scrolls instead. */}
      <section
        aria-label={ALL.filter((s) => s !== bottom).map((s) => config.labels[s]).join(", ")}
        data-board
        className={`mt-5 flex flex-col overflow-hidden rounded-card border-[1.5px] border-ink md:flex-1 md:basis-0 ${
          config.columns ? MIN_HEIGHT.columns : MIN_HEIGHT.split
        }`}
      >
        {/* Completed takes the left 2/3 (both rows); the other two stack on the right.
            Width split: md:grid-cols-[2fr_1fr]. */}
        {config.columns ? (
          // Equal columns with a thin line between them.
          <div className={`grid flex-1 grid-cols-[minmax(0,1fr)] divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0 min-h-0`}>
            {config.columns.map((s) => (
              <Area key={s} status={s} label={config.labels[s]} count={board[s].length} mascot={config.mascots?.[s]}>
                {board[s].map((it) => card(it))}
              </Area>
            ))}
          </div>
        ) : (
          <div className={`grid flex-1 grid-cols-[minmax(0,1fr)] divide-y divide-line md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] md:grid-rows-2 md:divide-y-0 min-h-0`}>
            <Area status="completed" label={config.labels.completed} count={board.completed.length} mascot={config.mascots?.completed} className="md:row-span-2 md:border-r md:border-line" wide>
              {board.completed.map((it) => card(it))}
            </Area>
            <Area status="playing" label={config.labels.playing} count={board.playing.length} mascot={config.mascots?.playing}>
              {board.playing.map((it) => card(it))}
            </Area>
            <Area status="stopped" label={config.labels.stopped} count={board.stopped.length} mascot={config.mascots?.stopped} className="md:border-t md:border-line">
              {board.stopped.map((it) => card(it))}
            </Area>
          </div>
        )}
        <BottomRow status={bottom} label={config.labels[bottom]} count={board[bottom].length} empty={config.emptyBottomRow}>
          {board[bottom].map((item) => (
            <div key={item.id} className="w-60 shrink-0">
              {card(item, true)}
            </div>
          ))}
        </BottomRow>
      </section>

      {/* The card that follows your cursor while dragging (drawn on top of everything). */}
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
        {dragging ? <CardFace item={dragging} config={config} lifted /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Area({
  status,
  label,
  count,
  mascot,
  className = "",
  wide,
  children,
}: {
  status: Status;
  label: string;
  count: number;
  mascot?: { src: string; className: string };
  className?: string;
  wide?: boolean; // Completed: cards in two columns on wide screens
  children: ReactNode[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const [scrolled, setScrolled] = useState(false); // shows the fade under the title

  return (
    // overflow-hidden: trims the mascot at the area's edges.
    <div ref={setNodeRef} className={`relative flex min-h-0 flex-col overflow-hidden transition-colors ${isOver ? "bg-surface/60" : ""} ${className}`}>
      {mascot && (
        // eslint-disable-next-line @next/next/no-img-element -- decorative
        <img src={mascot.src} alt="" aria-hidden="true" className={`pointer-events-none absolute z-0 select-none opacity-60 ${mascot.className}`} />
      )}
      <div className="relative z-10 flex shrink-0 items-baseline justify-between gap-3 px-4 pb-2 pt-4">
        <h2 className="font-display text-lg font-semibold">{label}</h2>
        <p className="text-sm text-muted">{count}</p>
        {/* Fade under the title once the area has scrolled. Height: h-5. */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 top-full h-5 bg-gradient-to-b from-paper to-transparent transition-opacity duration-200 ${
            scrolled && !isOver ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>
      {/* Phones: each area is capped and scrolls. Wider screens: fills its part of the box. */}
      <div
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
        className={`relative z-[1] max-h-[55dvh] min-h-0 flex-1 overflow-y-auto px-3 pb-3 md:max-h-none ${
          wide ? "grid content-start items-start gap-2 lg:grid-cols-2" : "space-y-2"
        }`}
      >
        {children.length === 0 ? <p className="px-1 py-6 text-center text-sm text-muted lg:col-span-2">Drag one here</p> : children}
      </div>
    </div>
  );
}

function BottomRow({
  status,
  label,
  count,
  empty,
  children,
}: {
  status: Status;
  label: string;
  count: number;
  empty: string;
  children: ReactNode[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div ref={setNodeRef} className={`shrink-0 border-t-[1.5px] border-ink transition-colors ${isOver ? "bg-surface/60" : ""}`}>
      <div className="flex items-baseline gap-3 px-4 pb-1 pt-3">
        <h2 className="font-display text-lg font-semibold">{label}</h2>
        <p className="text-sm text-muted">{count}</p>
      </div>
      {/* One row that scrolls sideways. items-start: an opened card doesn't stretch the others. */}
      <div className="flex items-start gap-2 overflow-x-auto px-3 pb-3 pt-1">
        {children.length === 0 ? <p className="px-2 py-2 text-sm text-muted">{empty}</p> : children}
      </div>
    </div>
  );
}

// One item. Closed: (date) + title (+ tag, + a note icon). Click to open: details, the note, edit/delete.
// floating: used in the bottom row. Opening it shows the details in a panel floating just above the
// card (over the areas above), so the row never changes height and nothing above it moves.
function Card<T extends BoardItem>({
  item,
  focused,
  config,
  floating = false,
}: {
  item: T;
  focused: boolean;
  config: BoardConfig<T>;
  floating?: boolean;
}) {
  const [open, setOpen] = useState(focused);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const ref = useRef<HTMLDivElement | null>(null);
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: item.id, data: { item }, disabled: editing });

  // Picked from search while already on this page: open it.
  const [openedFor, setOpenedFor] = useState(focused);
  if (focused && !openedFor) {
    setOpenedFor(true);
    setOpen(true);
  }
  if (!focused && openedFor) setOpenedFor(false);

  // Arrived from a search result: scroll its area to it while it flashes.
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  }, [focused]);

  async function remove() {
    const ok = await confirm({ title: `Delete "${item.title}"?`, body: "It'll be removed for good.", confirmLabel: "Delete" });
    if (ok) startTransition(() => config.onDelete(item));
  }

  const editor = <div className="rounded-card bg-surface p-3 ring-1 ring-line">{config.editor(item, () => setEditing(false))}</div>;
  if (editing && !floating) return editor;

  // Bottom row: the card itself always stays closed; the open view floats above it.
  const showOpenInPlace = open && !floating;

  return (
    <div
      ref={(el) => {
        ref.current = el;
        setNodeRef(el);
      }}
      {...attributes}
      {...listeners}
      onClick={() => setOpen((o) => !o)}
      onKeyDown={(e) => {
        if (e.key === "Enter") setOpen((o) => !o);
        else listeners?.onKeyDown?.(e);
      }}
      aria-expanded={open}
      // A floating card that's open gets a ring, so you can see which one the panel belongs to.
      aria-label={`${item.title}, ${config.labels[item.status]}. Press Enter to open, Space to drag.`}
      // While dragging, the floating copy moves; this one stays as a faint placeholder.
      className={`cursor-grab touch-manipulation select-none rounded-card transition-opacity focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing ${
        isDragging ? "opacity-30" : ""
      } ${pending ? "opacity-40" : ""} ${floating && open ? "ring-2 ring-accent/40" : ""}`}
      style={{ outline: "none" }}
    >
      <CardFace item={item} config={config} open={showOpenInPlace} focused={focused} onEdit={() => setEditing(true)} onDelete={remove} />
      {floating && open && !isDragging && (
        <FloatingPanel
          anchor={ref}
          wide={editing}
          // While editing, clicking elsewhere doesn't close it (so you don't lose your changes).
          onClose={() => {
            if (!editing) setOpen(false);
          }}
        >
          {editing ? editor : <CardFace item={item} config={config} open onEdit={() => setEditing(true)} onDelete={remove} />}
        </FloatingPanel>
      )}
    </div>
  );
}

// A panel pinned just above `anchor` (drawn on top of the page, so nothing clips it or moves).
// Follows the card if the row scrolls sideways or the window resizes. Escape / clicking away closes it.
function FloatingPanel({
  anchor,
  wide,
  onClose,
  children,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; bottom: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.max(r.width, wide ? 360 : 260);
      const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
      setPos({ left, bottom: window.innerHeight - r.top + 6, width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true); // true: also when the row itself scrolls
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, wide]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if ((t as Element).closest?.("dialog")) return; // the delete confirmation
      if (!panelRef.current?.contains(t) && !anchor.current?.contains(t)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  if (!pos) return null;
  return createPortal(
    <div
      ref={panelRef}
      // Clicks inside the panel shouldn't reach the card underneath (which would close it).
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className="panel-pop fixed z-50 rounded-card bg-surface shadow-xl shadow-ink/20 ring-1 ring-line"
      style={{ left: pos.left, bottom: pos.bottom, width: pos.width }}
    >
      {children}
    </div>,
    document.body,
  );
}

function CardFace<T extends BoardItem>({
  item,
  config,
  open = false,
  focused = false,
  lifted = false,
  onEdit,
  onDelete,
}: {
  item: T;
  config: BoardConfig<T>;
  open?: boolean;
  focused?: boolean;
  lifted?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const hasDates = Boolean(config.leftDate);
  const date = config.leftDate?.(item) ?? null;
  const detail = config.detail?.(item) ?? "";
  const tag = config.tag?.(item) ?? null;
  const cover = config.cover ? (config.cover(item) ?? "") : null; // null = this board has no covers
  // What shows under the title when open: the board's own body (Goals: why + proof), or the note.
  const body: ReactNode = config.body ? config.body(item) : item.note;

  const actions = (
    <div className="flex justify-center gap-0.5">
      <IconButton label={`Edit ${item.title}`} onClick={onEdit}>
        <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </IconButton>
      <IconButton label={`Delete ${item.title}`} onClick={onDelete} danger>
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </IconButton>
    </div>
  );

  return (
    // bg-surface/80 = slightly see-through, so the mascots show faintly behind. Use bg-surface for solid.
    // Card height: py-1.5 (top/bottom padding) + one line of text.
    <div
      className={`rounded-card bg-surface/80 px-3 py-1.5 ${focused ? "flash" : ""} ${
        lifted ? "rotate-2 cursor-grabbing bg-surface shadow-xl shadow-ink/25 ring-1 ring-line" : ""
      }`}
    >
      <div className="flex items-stretch gap-2.5">
        {/* Left (boards with dates): the date, centered over edit/delete when open.
            Always the same width (w-16) with a border that's only colored when open, so nothing
            shifts when a card opens. */}
        {hasDates && (
          <div
            className={`flex w-16 shrink-0 flex-col items-center whitespace-nowrap border-r pr-2 leading-tight ${
              open ? "border-line" : "border-transparent"
            }`}
          >
            <div className="flex min-h-7 items-center">
              {date ? <span className="num text-xs text-muted">{date}</span> : <span className="text-xs text-muted/60">—</span>}
            </div>
            {open && <div className="mt-1">{actions}</div>}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className={`flex min-h-7 gap-2 ${open ? "items-start" : "items-center"}`}>
            {/* The cover: a small tile on a closed card, bigger when open. */}
            {cover !== null && <Cover src={cover} title={item.title} big={open} />}
            <p className={`min-w-0 flex-1 text-[15px] font-medium text-ink ${open ? "break-words pt-1" : "truncate"}`}>{item.title}</p>
            {tag && (
              <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                {tag}
              </span>
            )}
            {/* Has a note: a small speech bubble (only while closed). */}
            {body && !open && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-label="Has a note" className="shrink-0 text-muted">
                <title>Has a note</title>
                <path d="M5 5h14v10H9l-4 4V5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          {open && (
            <div className="pb-0.5">
              {detail && <p className="num text-xs text-muted">{detail}</p>}
              {/* A thin line between the title/dates and the note. */}
              {body && (
                <div className="mt-1.5 break-words border-t border-line pt-1.5 text-sm leading-relaxed text-ink/80">{body}</div>
              )}
              {!detail && !body && <p className="text-xs text-muted">No notes yet.</p>}
            </div>
          )}
        </div>

        {/* Boards without dates (anime): edit/delete hug the right side, behind a thin line. */}
        {!hasDates && open && <div className="flex shrink-0 items-start border-l border-line pl-2 pt-0.5">{actions}</div>}
      </div>
    </div>
  );
}

// A cover picture, or (for your own titles) a plain tile with the first letter.
function Cover({ src, title, big }: { src: string; title: string; big: boolean }) {
  const size = big ? "h-[4.5rem] w-[3.25rem] rounded-[6px]" : "h-7 w-5 rounded-[4px]";
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote cover (AniList / IGDB)
    <img src={src} alt="" draggable={false} className={`${size} shrink-0 bg-line object-cover`} />
  ) : (
    <span aria-hidden="true" className={`${size} grid shrink-0 place-items-center bg-line/80 font-display text-[11px] font-semibold text-muted`}>
      {title.trim()[0]?.toUpperCase()}
    </span>
  );
}

function IconButton({ label, onClick, danger, children }: { label: string; onClick?: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      // Don't let a click here also open/close the card or start a drag.
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={`grid size-6 place-items-center rounded-md text-muted transition-colors hover:bg-paper ${danger ? "hover:text-danger" : "hover:text-ink"}`}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}
