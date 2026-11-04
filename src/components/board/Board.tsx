"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
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

// The shortest the board gets on wide screens: room for at least 8 cards in every area, measured:
//   an open area = title 52px + 8 cards (64px each + 8px gaps = 568px) + 12px padding = 632px
//   right side   = the open area + the closed one's title (60px) + a line = 693px
//   + the bottom row (125px) + the box's borders ≈ 821px → 51.5rem
// Up to that size, the box also stays within the screen under the pinned title + search
// (--sticky-top; 2.75rem = the gap above the box + the page's bottom padding), so once you scroll
// down its top border stays in view. On screens too short for both, the 8 cards win.
// Boards without covers (Goals) have small cards: ~28rem is plenty, always within the screen.
const MIN_HEIGHT = {
  covers: "md:min-h-[51.5rem] md:max-h-[max(51.5rem,calc(100dvh-var(--sticky-top,0px)-2.75rem))]",
  plain: "md:min-h-[min(28rem,calc(100dvh-var(--sticky-top,0px)-2.75rem))] md:max-h-[calc(100dvh-var(--sticky-top,0px)-2.75rem)]",
};

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

// ---------- Posters vs list (boards with covers) ----------
// Posters: the cover art up front, in a grid; click one for its details. List: one row each.
// Remembered per board in this browser.
type View = "posters" | "list";
const viewKey = (id: string) => `board-view:${id}`;
const viewListeners = new Set<() => void>();
function readView(id: string): View {
  try {
    return localStorage.getItem(viewKey(id)) === "list" ? "list" : "posters";
  } catch {
    return "posters";
  }
}
function writeView(id: string, v: View) {
  try {
    localStorage.setItem(viewKey(id), v);
  } catch {
    /* private window: just this visit */
  }
  viewListeners.forEach((l) => l());
}
const subscribeView = (l: () => void) => {
  viewListeners.add(l);
  return () => viewListeners.delete(l);
};
const PosterView = createContext(false);

// Sharper art for posters. AniList's file folders are one size off from their names:
// small = "medium" (~100px wide), medium = "large" (~230px), large = "extraLarge" (~460px).
// IGDB: cover_big_2x (~530px wide).
export function bigCover(url: string) {
  return url.replace(/\/cover\/(small|medium)\//, "/cover/large/").replace("/t_cover_small_2x/", "/t_cover_big_2x/");
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
  const storedView = useSyncExternalStore(subscribeView, () => readView(config.id), () => "posters" as View);
  const posters = Boolean(config.cover) && storedView === "posters";
  // The right side (split layout): only one of its two areas is open at a time.
  const [rightOpen, setRightOpen] = useState<Status>(() => (items.stopped.some((x) => x.id === focusId) ? "stopped" : "playing"));
  const [veiled, setVeiled] = useState(false);
  // Click either title: opens that one, or (if it's already open) switches back to the other.
  // Same feel as the other apps' sliding boxes: a veil fades in (150ms), the areas swap under it,
  // then it fades out (300ms).
  function toggleRight(s: Status) {
    if (veiled) return; // mid-swap
    const next: Status = rightOpen === s ? (s === "playing" ? "stopped" : "playing") : s;
    setVeiled(true);
    setTimeout(() => setRightOpen(next), 150);
    setTimeout(() => setVeiled(false), 190);
  }
  const [seenFocus, setSeenFocus] = useState(focusId);
  if (focusId !== seenFocus) {
    setSeenFocus(focusId);
    if (board.stopped.some((x) => x.id === focusId)) setRightOpen("stopped");
    else if (board.playing.some((x) => x.id === focusId)) setRightOpen("playing");
  }
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
    <PosterView.Provider value={posters}>
    <DndContext id={config.id} sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      {/* The black box. Wide screens: fills the rest of the screen and never grows with the number of
          items. Short screens: see MIN_HEIGHT. */}
      {/* The box's wrapper: sizes the box, and holds the pinned top edge right on top of it.
          isolate: everything in here stays under the add box's dropdown. */}
      <div className={`relative isolate mt-5 flex flex-col md:flex-1 md:basis-0 ${config.cover ? MIN_HEIGHT.covers : MIN_HEIGHT.plain}`}>
        {/* Shorter screens, where the page scrolls: the box's top edge (rounded corners and all) stays
            pinned under the title + search, with each area's title just below it. At rest it sits
            exactly on the real border (same width, same edges, same line), so you can't tell it's
            there. Each corner piece paints the page color over the box's straight side border,
            then draws the curve. */}
        {/* data-stick-under: once it's pinned, the title bar's fade steps aside so the edge stays crisp. */}
        <div aria-hidden="true" data-stick-under className="pointer-events-none sticky top-[var(--sticky-top,0px)] z-30 hidden h-0 md:block">
          <div className="absolute inset-x-0 top-0 h-[18px]">
            <div className="absolute left-0 top-0 size-[18px] bg-paper">
              <div className="size-full rounded-tl-card border-l-[1.5px] border-t-[1.5px] border-ink bg-paper" />
            </div>
            <div className="absolute inset-x-[18px] top-0 border-t-[1.5px] border-ink" />
            <div className="absolute right-0 top-0 size-[18px] bg-paper">
              <div className="size-full rounded-tr-card border-r-[1.5px] border-t-[1.5px] border-ink bg-paper" />
            </div>
          </div>
        </div>
      <section
        aria-label={ALL.filter((s) => s !== bottom).map((s) => config.labels[s]).join(", ")}
        data-board
        className="relative flex flex-col rounded-card border-[1.5px] border-ink md:min-h-0 md:flex-1"
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
          <div className={`grid flex-1 grid-cols-[minmax(0,1fr)] divide-y divide-line md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] md:divide-y-0 min-h-0`}>
            <Area
              status="completed"
              label={config.labels.completed}
              count={board.completed.length}
              mascot={config.mascots?.completed}
              className="md:border-r md:border-line"
              wide={!config.cover}
              roomy={Boolean(config.cover)}
              poster={posters ? "big" : undefined}
              extra={config.cover ? <ViewToggle view={posters ? "posters" : "list"} onChange={(v) => writeView(config.id, v)} /> : null}
            >
              {board.completed.map((it) => card(it))}
            </Area>
            {/* Right side: one area open at a time. Watching open → Dropped's title sits at the bottom.
                Dropped open → its title moves up under Watching's, and fills the rest. */}
            <div className="relative flex min-h-0 flex-col">
              {(["playing", "stopped"] as const).map((s) => (
                <Area
                  key={s}
                  roomy={Boolean(config.cover)}
                  poster={posters ? "small" : undefined}
                  status={s}
                  label={config.labels[s]}
                  count={board[s].length}
                  mascot={config.mascots?.[s]}
                  className={s === "stopped" ? "border-t border-line" : ""}
                  collapsed={rightOpen !== s}
                  onToggle={() => toggleRight(s)}
                >
                  {board[s].map((it) => card(it))}
                </Area>
              ))}
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute inset-0 z-20 bg-paper transition-opacity ease-out motion-reduce:hidden ${
                  veiled ? "opacity-100 duration-150" : "opacity-0 duration-300"
                }`}
              />
            </div>
          </div>
        )}
        <BottomRow status={bottom} label={config.labels[bottom]} count={board[bottom].length} empty={config.emptyBottomRow}>
          {board[bottom].map((item) => (
            <div key={item.id} className={`shrink-0 ${posters ? "w-24" : "w-60"}`}>
              {card(item, true)}
            </div>
          ))}
        </BottomRow>
      </section>
      </div>

      {/* The card that follows your cursor while dragging (drawn on top of everything). */}
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
        {dragging ? (
          posters ? (
            <div className="w-28 rotate-3">
              <PosterFace item={dragging} config={config} lifted />
            </div>
          ) : (
            <CardFace item={dragging} config={config} lifted />
          )
        ) : null}
      </DragOverlay>
    </DndContext>
    </PosterView.Provider>
  );
}

function Area({
  status,
  label,
  count,
  mascot,
  className = "",
  wide,
  collapsed,
  onToggle,
  roomy,
  poster,
  extra,
  children,
}: {
  status: Status;
  label: string;
  count: number;
  mascot?: { src: string; className: string };
  className?: string;
  wide?: boolean; // Completed: cards in two columns on wide screens (boards without covers)
  collapsed?: boolean; // the right side's accordion: just the title, click it to open
  onToggle?: () => void;
  roomy?: boolean; // big cover cards: phones keep room for 8
  poster?: "big" | "small"; // poster grid: Completed (wider tiles) / the right side
  extra?: ReactNode; // shown before the count (Completed: Posters / List)
  children: ReactNode[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const [scrolled, setScrolled] = useState(false); // shows the fade under the title

  return (
    // overflow-clip: trims the mascot at the area's edges (and, unlike overflow-hidden, lets the title stick).
    <div
      ref={setNodeRef}
      className={`relative flex flex-col overflow-clip transition-colors ${collapsed ? "shrink-0" : "min-h-0 flex-1"} ${
        isOver ? "bg-surface/60" : ""
      } ${className}`}
    >
      {mascot && !collapsed && (
        // eslint-disable-next-line @next/next/no-img-element -- decorative
        <img src={mascot.src} alt="" aria-hidden="true" className={`pointer-events-none absolute z-0 select-none opacity-60 ${mascot.className}`} />
      )}
      {/* The title. Wide screens: sticks under the pinned title + search while the page scrolls. */}
      <div
        className={`relative z-10 flex shrink-0 items-baseline justify-between gap-3 px-4 pt-4 md:sticky md:bg-paper md:top-[var(--sticky-top,0px)] ${
          collapsed ? "pb-4" : "pb-2"
        }`}
      >
        {onToggle ? (
          // Accordion title: the whole row opens this area (and closes the other).
          <h2 className={`-mx-4 -mt-4 flex flex-1 ${collapsed ? "-mb-4" : "-mb-2"}`}>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            className={`group flex flex-1 items-baseline justify-between gap-3 px-4 pt-4 text-left ${collapsed ? "pb-4" : "pb-2"}`}
          >
            <span className="flex items-baseline gap-2">
              <span className="font-display text-lg font-semibold">{label}</span>
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className={`self-center text-muted transition-transform duration-200 group-hover:text-ink ${collapsed ? "-rotate-90" : ""}`}
              >
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="text-sm text-muted">{count}</span>
          </button>
          </h2>
        ) : (
          <>
            <h2 className="font-display text-lg font-semibold">{label}</h2>
            <div className="flex items-center gap-3">
              {extra}
              <p className="text-sm text-muted">{count}</p>
            </div>
          </>
        )}
        {/* Fade under the title once the area has scrolled. Height: h-5. */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 top-full h-5 bg-gradient-to-b from-paper to-transparent transition-opacity duration-200 ${
            scrolled && !isOver ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>
      {/* Phones: each area is capped (still room for 8 cards: 39.5rem) and scrolls. Wider screens: fills its part of the box. */}
      {!collapsed && (
        <div
          onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
          className={`relative z-[1] ${roomy ? "max-h-[max(55dvh,39.5rem)]" : "max-h-[55dvh]"} min-h-0 flex-1 overflow-y-auto px-3 pb-3 md:max-h-none ${
            poster === "big"
            ? "grid content-start items-start gap-x-3 gap-y-4 [grid-template-columns:repeat(auto-fill,minmax(6rem,1fr))] md:[grid-template-columns:repeat(auto-fill,minmax(6.75rem,1fr))]"
            : poster === "small"
              ? "grid content-start items-start gap-x-3 gap-y-4 [grid-template-columns:repeat(auto-fill,minmax(5.5rem,1fr))]"
              : wide
                ? "grid content-start items-start gap-2 lg:grid-cols-2"
                : "space-y-2"
          }`}
        >
          {children.length === 0 ? <p className="col-span-full px-1 py-6 text-center text-sm text-muted">Drag one here</p> : children}
        </div>
      )}
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
  const poster = useContext(PosterView);

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

  // Boards with covers (Games / Anime): clicking opens the details on the right (DetailsPanel).
  if (config.cover) {
    return (
      <div
        ref={(el) => {
          ref.current = el;
          setNodeRef(el);
        }}
        {...attributes}
        {...listeners}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") setOpen(true);
          else listeners?.onKeyDown?.(e);
        }}
        aria-expanded={open}
        aria-label={`${item.title}, ${config.labels[item.status]}. Press Enter to open, Space to drag.`}
        className={`cursor-grab touch-manipulation select-none rounded-card transition-opacity focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing ${
          isDragging ? "opacity-30" : ""
        } ${pending ? "opacity-40" : ""}`}
        style={{ outline: "none" }}
      >
        {poster ? (
          <PosterFace item={item} config={config} focused={focused} active={open} />
        ) : (
          <CardFace item={item} config={config} focused={focused} active={open} />
        )}
        {open && (
          <DetailsPanel
            item={item}
            config={config}
            editing={editing}
            onEdit={setEditing}
            onDelete={remove}
            onClose={() => {
              setOpen(false);
              setEditing(false);
            }}
          />
        )}
      </div>
    );
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
          follow={focused}
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
  follow = false,
  onClose,
  children,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  wide?: boolean;
  follow?: boolean; // opened from search: follow the card while its list scrolls to it
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);

  const placeRef = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    const stickyTop = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sticky-top")) || 0;
    // Where the card can be seen: inside the list it scrolls in, on screen, below the pinned bar.
    const visibleArea = () => {
      const list = anchor.current?.closest(".overflow-y-auto, .overflow-x-auto")?.getBoundingClientRect();
      return {
        top: Math.max(list?.top ?? 0, stickyTop()),
        bottom: Math.min(list?.bottom ?? window.innerHeight, window.innerHeight),
        left: Math.max(list?.left ?? 0, 0),
        right: Math.min(list?.right ?? window.innerWidth, window.innerWidth),
      };
    };
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.max(r.width, wide ? 360 : 260);
      const left = Math.min(Math.max(8, r.left + r.width / 2 - width / 2), window.innerWidth - width - 8);
      // Above the card if it fits there (bottom row), otherwise below it; if neither fits, the
      // side with more room. Uses the panel's real height once it's drawn.
      const h = panelRef.current?.offsetHeight ?? 170;
      const above = r.top - stickyTop() - 12;
      const below = window.innerHeight - r.bottom - 12;
      const up = above >= h ? true : below >= h ? false : above > below;
      setPos(up ? { left, bottom: window.innerHeight - r.top + 6, width } : { left, top: r.bottom + 6, width });
    };
    placeRef.current = place;
    place();

    // Scrolling: the panel follows the card a little, but closes once the card has moved away
    // (more than ~40px) or out of view. Picked from search, it only follows for the first moment
    // (while the list scrolls itself to the card).
    const settleMs = follow ? 900 : 0;
    const openedAt = Date.now();
    let base: DOMRect | null = null;
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return; // scrolling inside the panel itself
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      if (Date.now() - openedAt < settleMs) return place();
      base ??= r;
      const v = visibleArea();
      const gone = r.bottom < v.top + 24 || r.top > v.bottom - 24 || r.right < v.left + 24 || r.left > v.right - 24;
      if (gone || Math.abs(r.top - base.top) > 40 || Math.abs(r.left - base.left) > 40) closeRef.current();
      else place();
    };
    // Where the card sits once things settle: the starting point for "moved away".
    if (!settleMs) base = anchor.current?.getBoundingClientRect() ?? null;
    const settle = setTimeout(() => {
      base = anchor.current?.getBoundingClientRect() ?? null;
    }, settleMs);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true); // true: also when the row / list scrolls
    return () => {
      clearTimeout(settle);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [anchor, wide, follow]);

  // Once drawn, place it again with its real height (so it never hides under the pinned bar).
  const drawn = pos !== null;
  useLayoutEffect(() => {
    if (drawn) placeRef.current();
  }, [drawn]);

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
      style={{ left: pos.left, bottom: pos.bottom, top: pos.top, width: pos.width }}
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
  active = false,
  onEdit,
  onDelete,
}: {
  item: T;
  config: BoardConfig<T>;
  open?: boolean;
  focused?: boolean;
  lifted?: boolean;
  active?: boolean; // its details panel is open (Games / Anime)
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
  // Boards with covers (Anime / Games): bigger cards, one per line.
  const row = cover !== null ? "min-h-12" : "min-h-7";

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
    // Card height: py-1.5 (top/bottom padding) + one line of text (covers: py-2 + the cover).
    <div
      className={`rounded-card bg-surface/80 px-3 ${cover !== null ? "py-2" : "py-1.5"} ${focused ? "flash" : ""} ${
        lifted ? "rotate-2 cursor-grabbing bg-surface shadow-xl shadow-ink/25 ring-1 ring-line" : ""
      } ${active ? "ring-2 ring-accent" : ""}`}
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
            <div className={`flex ${row} items-center`}>
              {date ? <span className="num text-xs text-muted">{date}</span> : <span className="text-xs text-muted/60">—</span>}
            </div>
            {open && <div className="mt-1">{actions}</div>}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className={`flex ${row} ${cover !== null ? "gap-3" : "gap-2"} ${open ? "items-start" : "items-center"}`}>
            {/* The cover: a small tile on a closed card, bigger when open. */}
            {cover !== null && <Cover src={cover} title={item.title} big={open} />}
            <p
              className={`min-w-0 flex-1 font-medium text-ink ${cover !== null ? "text-base" : "text-[15px]"} ${
                open ? `break-words ${cover !== null ? "pt-1.5" : "pt-1"}` : "truncate"
              }`}
            >
              {item.title}
            </p>
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
            </div>
          )}
        </div>

        {/* Boards without dates (anime): edit/delete hug the right side, behind a thin line. */}
        {!hasDates && open && <div className="flex shrink-0 items-start border-l border-line pl-2 pt-0.5">{actions}</div>}
      </div>
    </div>
  );
}

// Games / Anime: an entry's details, sliding in from the right (like the sidebar's panels).
// The cover up top, then the title, where it is, the dates, the note; Edit swaps in the form.
function DetailsPanel<T extends BoardItem>({
  item,
  config,
  editing,
  onEdit,
  onDelete,
  onClose,
}: {
  item: T;
  config: BoardConfig<T>;
  editing: boolean;
  onEdit: (on: boolean) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const src = config.cover?.(item) ?? "";
  const detail = config.detail?.(item) ?? "";
  const tag = config.tag?.(item) ?? null;
  const body: ReactNode = config.body ? config.body(item) : item.note;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Drawn on top of the page. Its events mustn't reach the card behind it (they'd start a drag).
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return createPortal(
    <div className="fixed inset-0 z-[70]" onClick={stop} onPointerDown={stop} onMouseDown={stop} onTouchStart={stop} onKeyDown={stop}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-ink/30" />
      <aside
        aria-label={item.title}
        className="panel-slide absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-hidden bg-paper shadow-2xl shadow-ink/30"
      >
        {/* The art, with a soft blurred copy of it filling the space behind. */}
        <div className="relative shrink-0 overflow-hidden border-b border-line">
          {src && (
            // eslint-disable-next-line @next/next/no-img-element -- decorative backdrop
            <img src={bigCover(src)} alt="" aria-hidden="true" className="absolute inset-0 size-full scale-125 object-cover opacity-35 blur-2xl" />
          )}
          <div className="relative flex items-end gap-4 px-5 pb-5 pt-12">
            <div className="w-32 shrink-0 overflow-hidden rounded-[10px] shadow-lg shadow-ink/30">
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote cover (AniList / IGDB)
                <img
                  src={bigCover(src)}
                  alt=""
                  onError={(e) => {
                    if (e.currentTarget.src !== src) e.currentTarget.src = src;
                  }}
                  className="aspect-[3/4] w-full object-cover"
                />
              ) : (
                <div className="grid aspect-[3/4] place-items-center bg-gradient-to-br from-line to-accent/25">
                  <span className="font-display text-5xl font-semibold text-accent/60">{item.title.trim()[0]?.toUpperCase()}</span>
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <p className="flex flex-wrap gap-1.5">
                <span className="rounded-full bg-paper/90 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink">
                  {config.labels[item.status]}
                </span>
                {tag && (
                  <span className="rounded-full bg-paper/90 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{tag}</span>
                )}
              </p>
              <h2 className="mt-2 break-words font-display text-2xl font-semibold leading-tight text-ink">{item.title}</h2>
              {detail && <p className="num mt-1 text-sm text-muted">{detail}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 grid size-9 place-items-center rounded-control bg-paper/80 text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 [scrollbar-width:thin]">
          {editing ? (
            config.editor(item, () => onEdit(false))
          ) : (
            <>
              {body ? (
                <div className="break-words rounded-card bg-surface px-4 py-3 text-[15px] leading-relaxed text-ink/85">{body}</div>
              ) : (
                <p className="text-sm text-muted">No note.</p>
              )}
              <div className="mt-5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onEdit(true)}
                  className="flex items-center gap-1.5 rounded-control bg-accent px-4 py-2 font-semibold text-accent-ink transition-opacity hover:opacity-90"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Edit
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  className="rounded-control px-3 py-2 text-sm text-muted transition-colors hover:bg-surface hover:text-danger"
                >
                  Delete
                </button>
              </div>
              <p className="mt-6 text-xs text-muted">Drag the card on the board to move it to another list.</p>
            </>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

// A poster: the cover art, big, with the title (and date / tag / note mark) under it.
// Click it for the details (dates, note, edit, delete) in a panel beside it.
function PosterFace<T extends BoardItem>({
  item,
  config,
  focused = false,
  active = false,
  lifted = false,
}: {
  item: T;
  config: BoardConfig<T>;
  focused?: boolean;
  active?: boolean; // its details are open
  lifted?: boolean; // being dragged
}) {
  const src = config.cover?.(item) ?? "";
  const date = config.leftDate?.(item) ?? null;
  const tag = config.tag?.(item) ?? null;
  const hasNote = Boolean(config.body ? config.body(item) : item.note);
  const meta = [date, tag].filter(Boolean).join(" · ");

  return (
    <div className="group">
      <div
        className={`relative aspect-[3/4] overflow-hidden rounded-[10px] bg-line shadow-sm shadow-ink/15 transition duration-200 ease-out ${
          lifted
            ? "shadow-xl shadow-ink/30 ring-1 ring-line"
            : active
              ? "-translate-y-1 shadow-lg shadow-ink/25 ring-2 ring-accent"
              : "group-hover:-translate-y-1 group-hover:shadow-lg group-hover:shadow-ink/25"
        }`}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote cover (AniList / IGDB)
          <img
            src={bigCover(src)}
            alt=""
            draggable={false}
            loading="lazy"
            // If the big version isn't there, fall back to the saved one.
            onError={(e) => {
              if (e.currentTarget.src !== src) e.currentTarget.src = src;
            }}
            className="size-full object-cover"
          />
        ) : (
          // Your own title (no art): a warm tile with its initial.
          <div className="grid size-full place-items-center bg-gradient-to-br from-line to-accent/25">
            <span className="font-display text-4xl font-semibold text-accent/60">{item.title.trim()[0]?.toUpperCase()}</span>
          </div>
        )}
        {hasNote && (
          <span title="Has a note" className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-paper/90 text-muted shadow-sm">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-label="Has a note">
              <path d="M5 5h14v10H9l-4 4V5z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </div>
      {/* Picked from search: the title flashes (its details open beside it, see Card). */}
      <p className="mt-1.5 line-clamp-2 px-0.5 text-[13px] font-medium leading-snug text-ink" title={item.title}>
        <span className={`-mx-1 box-decoration-clone rounded-[5px] px-1 ${focused ? "flash" : ""}`}>{item.title}</span>
      </p>
      {meta && <p className="num px-0.5 text-[11px] uppercase tracking-wide text-muted">{meta}</p>}
    </div>
  );
}

// Posters / List, in Completed's title row.
function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div role="radiogroup" aria-label="View" className="flex rounded-control bg-surface p-0.5">
      {(
        [
          ["posters", "Posters", <path key="p" d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />],
          ["list", "List", <path key="l" d="M4 6h16M4 12h16M4 18h16" />],
        ] as const
      ).map(([v, label, icon]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={view === v}
          aria-label={label}
          title={label}
          onClick={() => onChange(v)}
          className={`grid h-6 w-7 place-items-center rounded-[7px] transition-colors ${
            view === v ? "bg-paper text-ink shadow-sm" : "text-muted hover:text-ink"
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
            {icon}
          </svg>
        </button>
      ))}
    </div>
  );
}

// A cover picture, or (for your own titles) a plain tile with the first letter.
function Cover({ src, title, big }: { src: string; title: string; big: boolean }) {
  // Closed: h-12 (48px). Open: h-24 (96px). Covers are about 3:4.
  const size = big ? "h-24 w-[4.5rem] rounded-[7px]" : "h-12 w-9 rounded-[5px]";
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote cover (AniList / IGDB)
    <img src={big ? bigCover(src) : src} alt="" draggable={false} className={`${size} shrink-0 bg-line object-cover`} />
  ) : (
    <span aria-hidden="true" className={`${size} grid shrink-0 place-items-center bg-line/80 font-display ${big ? "text-2xl" : "text-base"} font-semibold text-muted`}>
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
