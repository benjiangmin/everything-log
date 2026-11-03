"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from "react";
import { deleteWish, setWishStatus } from "@/app/wishlist/actions";
import type { Wish, WishStatus } from "@/lib/wishlist";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import WishForm from "./WishForm";
import { dayLabel, showPrice } from "./dates";
import Mascot from "@/components/ui/Mascot";

const VEIL_MS = 620; // same slide timing as the unsuspicious documents' writing box

// "amazon.com" from a link, for the link chip.
function host(link: string) {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

// Left: what you still want. Right: what you got (and what you changed your mind on), folded into
// a slim strip until you open it (it slides open like the unsuspicious documents' writing box).
export default function WishBoard({
  want,
  got,
  dropped,
  focusId,
}: {
  want: Wish[];
  got: Wish[];
  dropped: Wish[];
  focusId?: string;
}) {
  const done = [...got, ...dropped];
  // Which section the right panel's header names: "Got it", or "Changed my mind" once you scroll to it.
  const [inDropped, setInDropped] = useState(false);
  const droppedRef = useRef<HTMLHeadingElement>(null);
  const [open, setOpen] = useState(() =>
    Boolean(focusId && done.some((b) => b.id === focusId)),
  );

  // Picked a bought item from search while already on the page: open the panel.
  const [seenFocus, setSeenFocus] = useState(focusId);
  if (focusId !== seenFocus) {
    setSeenFocus(focusId);
    if (focusId && done.some((b) => b.id === focusId)) setOpen(true);
  }

  // While the panel slides, an oat veil covers the left list so you don't see it reflow.
  const [veil, setVeil] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    setInDropped(false);
    setVeil((v) => v + 1);
  }
  useEffect(() => {
    if (!veil) return;
    const t = setTimeout(() => setVeil(0), VEIL_MS);
    return () => clearTimeout(t);
  }, [veil]);

  return (
    <div className="mt-5 flex flex-col gap-6 lg:min-h-[28rem] lg:flex-1 lg:basis-0 lg:flex-row">
      {/* ---------- Left: still want ---------- */}
      <ListBox
        title="Want"
        count={want.length}
        empty="Nothing on the wishlist right now."
        className="h-[65dvh] min-h-[20rem] lg:h-auto lg:min-h-0 lg:flex-1"
        veiled={veil > 0}
      >
        <ul className="space-y-1.5">
          {want.map((i) => (
            <Item key={i.id} item={i} focused={i.id === focusId} />
          ))}
        </ul>
      </ListBox>

      {/* ---------- Right: got it + changed my mind (slides between a slim strip and half the page) ----------
          delay-150 = wait for the veil first. Speed: duration-[450ms]. */}
      <section
        aria-label="Got it"
        style={
          {
            "--panel-w": open ? "calc(50% - 0.75rem)" : "4.5rem",
          } as CSSProperties
        }
        className={`relative isolate flex shrink-0 flex-col overflow-hidden rounded-card transition-[width] delay-150 duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none lg:w-[var(--panel-w)] ${
          open
            ? "h-[65dvh] min-h-[20rem] border-[1.5px] border-ink lg:h-auto"
            : "bg-surface"
        }`}
      >
        {!open ? (
          // Closed: a slim strip (wide screens) or a bar (phones).
          <div className="panel-in flex items-center justify-between gap-3 p-3 lg:h-full lg:flex-col lg:justify-start lg:gap-5 lg:px-0 lg:py-4">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={`Show got it (${got.length})`}
              title="Show got it"
              className="flex items-center gap-2 rounded-control bg-accent px-4 py-2.5 font-semibold text-accent-ink transition-opacity hover:opacity-90 lg:size-11 lg:justify-center lg:p-0"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M15 5l-7 7 7 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="lg:sr-only">Show got it</span>
            </button>
            <p className="text-sm text-muted lg:rotate-180 lg:[writing-mode:vertical-rl]">
              Got it · {got.length}
            </p>
          </div>
        ) : (
          <div className="panel-in flex min-h-0 flex-1 flex-col">
            <Mascot name="sylveon" corner="right" />
            <BoxHeader
              title={inDropped ? "Changed my mind" : "Got it"}
              count={inDropped ? dropped.length : got.length}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Hide got it"
                title="Hide"
                className="grid size-8 place-items-center rounded-control text-muted transition-colors hover:bg-surface hover:text-ink"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M9 5l7 7-7 7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </BoxHeader>
            <Scroller
              empty={done.length === 0 ? "Nothing here yet." : null}
              onScroll={(box) => {
                // Once "Changed my mind" scrolls up under the header, the header becomes it.
                const head = droppedRef.current;
                setInDropped(
                  Boolean(
                    head &&
                    head.getBoundingClientRect().bottom <=
                      box.getBoundingClientRect().top + 8,
                  ),
                );
              }}
            >
              <ul className="space-y-1.5">
                {got.map((i) => (
                  <Item key={i.id} item={i} focused={i.id === focusId} />
                ))}
              </ul>
              {dropped.length > 0 && (
                <div className="mt-6 border-t border-line pt-4">
                  <h3
                    ref={droppedRef}
                    className="flex items-baseline justify-between px-1 pb-2 font-display text-lg font-semibold"
                  >
                    Changed my mind{" "}
                    <span className="font-sans text-sm font-normal text-muted">
                      {dropped.length}
                    </span>
                  </h3>
                  <ul className="space-y-1.5">
                    {dropped.map((i) => (
                      <Item key={i.id} item={i} focused={i.id === focusId} />
                    ))}
                  </ul>
                </div>
              )}
            </Scroller>
          </div>
        )}
      </section>
    </div>
  );
}

function BoxHeader({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children?: ReactNode;
}) {
  return (
    <div className="relative z-10 flex shrink-0 items-center justify-between gap-3 bg-paper px-5 pb-2 pt-4 sm:px-6">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <div className="flex items-center gap-1">
        <p className="text-sm text-muted">{count}</p>
        {children}
      </div>
    </div>
  );
}

// The scrolling part of a box, with a fade under the header once scrolled.
function Scroller({
  empty,
  onScroll,
  children,
}: {
  empty: string | null;
  onScroll?: (box: HTMLDivElement) => void;
  children: ReactNode;
}) {
  const [scrolled, setScrolled] = useState(false);
  return (
    <div className="relative min-h-0 flex-1">
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 z-10 h-5 bg-gradient-to-b from-paper to-transparent transition-opacity duration-200 ${
          scrolled ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        onScroll={(e) => {
          setScrolled(e.currentTarget.scrollTop > 0);
          onScroll?.(e.currentTarget);
        }}
        className="absolute inset-0 overflow-y-auto px-3 pb-4 sm:px-4"
      >
        {empty ? (
          <p className="mt-1 rounded-card border border-dashed border-line px-5 py-6 text-muted">
            {empty}
          </p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function ListBox({
  title,
  count,
  empty,
  className,
  veiled,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  className: string;
  veiled: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={`relative isolate flex min-w-0 flex-col overflow-hidden rounded-card border-[1.5px] border-ink ${className}`}
    >
      {/* Mascot: the list's bottom-left corner (Sylveon sits in the Got it box). See Mascot.tsx to tweak. */}
      <Mascot name="jirachi" corner="left" />
      <BoxHeader title={title} count={count} />
      <Scroller empty={count === 0 ? empty : null}>{children}</Scroller>
      {/* The veil (wide screens): covers this list while the Got it panel slides. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 z-20 hidden bg-surface transition-opacity ease-out motion-reduce:hidden lg:block ${
          veiled ? "opacity-100 duration-150" : "opacity-0 duration-300"
        }`}
      />
    </section>
  );
}

function Item({ item, focused }: { item: Wish; focused: boolean }) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false); // details folded away by default
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const ref = useRef<HTMLLIElement>(null);

  // Arrived from a search result: scroll its box to it while it flashes.
  useEffect(() => {
    if (focused)
      ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focused]);

  const want = item.status === "want";
  const move = (status: WishStatus) =>
    startTransition(() => setWishStatus(item.id, status));

  async function remove() {
    const ok = await confirm({
      title: `Delete "${item.name}"?`,
      body: "It'll be removed for good.",
      confirmLabel: "Delete",
    });
    if (ok) startTransition(() => deleteWish(item.id));
  }

  if (editing) {
    return (
      <li className="rounded-card bg-surface p-3 ring-1 ring-line">
        <WishForm item={item} onDone={() => setEditing(false)} />
      </li>
    );
  }

  const hasDetails = Boolean(item.note || item.link || item.added_on);
  // Want and got it: same colour (the columns tell them apart). Changed my mind: faded with a strike.
  const nameColor = item.status === "dropped" ? "text-ink/55 line-through decoration-ink/30" : "text-ink";

  return (
    <li
      ref={ref}
      className={`group rounded-card bg-surface/80 px-3 py-2 transition-opacity ${pending ? "opacity-40" : ""} ${focused ? "flash" : ""}`}
    >
      <div className="flex items-center gap-3">
        {/* Got it (moves it right) / put it back on the wishlist. */}
        <button
          type="button"
          disabled={pending}
          onClick={() => move(want ? "got" : "want")}
          aria-label={
            want
              ? `Got "${item.name}"`
              : `Put "${item.name}" back on the wishlist`
          }
          title={want ? "Got it" : "Still want it"}
          className={`grid size-6 shrink-0 place-items-center rounded-full border-[1.5px] transition-colors ${
            item.status === "got"
              ? "border-accent/35 bg-accent/15 text-accent hover:bg-accent/25"
              : item.status === "dropped"
                ? "border-muted/60 text-muted hover:border-accent hover:text-accent"
                : "border-muted/60 text-transparent hover:border-accent hover:text-accent"
          }`}
        >
          {item.status === "dropped" ? (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4 12a8 8 0 1 0 2.5-5.8M4 4v4h4"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M5 12.5l4.5 4.5L19 7.5"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>

        {/* The name: click to show/hide the details (date, note, link). */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          disabled={!hasDetails}
          className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
        >
          <span className={`min-w-0 break-words ${nameColor}`}>
            {item.name}
          </span>
          {hasDetails && (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className={`shrink-0 text-muted/70 transition-transform ${open ? "rotate-180" : ""}`}
            >
              <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>

        {item.price && (
          <span className="num shrink-0 text-sm text-muted">
            {showPrice(item.price)}
          </span>
        )}

        <div className="-my-1 -mr-1 flex shrink-0">
          {want && (
            <button
              type="button"
              disabled={pending}
              onClick={() => move("dropped")}
              aria-label={`Changed my mind on ${item.name}`}
              title="Changed my mind"
              className="grid size-8 place-items-center rounded-control text-muted opacity-50 transition hover:bg-paper group-hover:text-black group-hover:opacity-100"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="8"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M6.5 17.5l11-11"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => setEditing(true)}
            aria-label={`Edit ${item.name}`}
            className="grid size-8 place-items-center rounded-control text-muted opacity-50 transition hover:bg-paper group-hover:text-black group-hover:opacity-100"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            aria-label={`Delete ${item.name}`}
            className="grid size-8 place-items-center rounded-control text-muted opacity-50 transition hover:bg-paper hover:text-danger! group-hover:text-black group-hover:opacity-100"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-1 space-y-2 pb-1 pl-9 pr-2 text-sm">
          {item.added_on && (
            <p
              className={`num text-xs uppercase tracking-wide text-muted/80 ${
                item.note || item.link ? "border-b border-accent/20 pb-1.5" : "" // the line between the date and the notes
              }`}
            >
              Added {dayLabel(item.added_on)}
            </p>
          )}
          {item.note && (
            <p className="whitespace-pre-line break-words text-muted">
              {item.note}
            </p>
          )}
          {item.link && (
            <a
              href={item.link}
              target="_blank"
              rel="noreferrer"
              title={item.link}
              className="inline-flex max-w-full items-center gap-1 rounded-control bg-paper px-2.5 py-1 text-xs font-semibold text-ink/80 ring-1 ring-line transition-colors hover:text-ink hover:ring-accent/40"
            >
              <span className="truncate">{host(item.link)}</span>
              <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      )}
    </li>
  );
}
