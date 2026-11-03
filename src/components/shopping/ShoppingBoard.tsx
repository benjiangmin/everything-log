"use client";

import { useEffect, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { deleteShoppingItem, setBought } from "@/app/shopping/actions";
import type { ShoppingItem } from "@/lib/shopping";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import ShoppingForm from "./ShoppingForm";
import { dayLabel, showPrice, todayKey } from "./dates";
import Mascot from "@/components/ui/Mascot";

const VEIL_MS = 620; // same slide timing as the unsuspicious documents' writing box

// Items in runs of the same day (they come in newest-day-first already).
function byDay(items: ShoppingItem[]) {
  const days: { date: string; items: ShoppingItem[] }[] = [];
  for (const i of items) {
    const last = days.at(-1);
    if (last && last.date === i.added_on) last.items.push(i);
    else days.push({ date: i.added_on, items: [i] });
  }
  return days;
}

// Left: what to buy. Right: what's been bought, folded into a slim strip until you open it
// (it slides open like the unsuspicious documents' writing box, just on the right).
export default function ShoppingBoard({ toBuy, bought, focusId }: { toBuy: ShoppingItem[]; bought: ShoppingItem[]; focusId?: string }) {
  const [open, setOpen] = useState(() => Boolean(focusId && bought.some((b) => b.id === focusId)));

  // Picked a bought item from search while already on the page: open the panel.
  const [seenFocus, setSeenFocus] = useState(focusId);
  if (focusId !== seenFocus) {
    setSeenFocus(focusId);
    if (focusId && bought.some((b) => b.id === focusId)) setOpen(true);
  }

  // While the panel slides, an oat veil covers the left list so you don't see it reflow.
  const [veil, setVeil] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    setVeil((v) => v + 1);
  }
  useEffect(() => {
    if (!veil) return;
    const t = setTimeout(() => setVeil(0), VEIL_MS);
    return () => clearTimeout(t);
  }, [veil]);

  return (
    <div className="mt-5 flex flex-col gap-6 lg:min-h-[28rem] lg:flex-1 lg:basis-0 lg:flex-row">
      {/* ---------- Left: to buy ---------- */}
      <ListBox
        title="To buy"
        count={toBuy.length}
        empty="Nothing to buy. Good lets keep it that way."
        className="h-[65dvh] min-h-[20rem] lg:h-auto lg:min-h-0 lg:flex-1"
        veiled={veil > 0}
      >
        {byDay(toBuy).map((d) => (
          <DayGroup key={d.date} date={d.date}>
            {d.items.map((i) => (
              <Item key={i.id} item={i} focused={i.id === focusId} />
            ))}
          </DayGroup>
        ))}
      </ListBox>

      {/* ---------- Right: bought (slides between a slim strip and half the page) ----------
          delay-150 = wait for the veil first. Speed: duration-[450ms]. */}
      <section
        aria-label="Bought"
        style={{ "--panel-w": open ? "calc(50% - 0.75rem)" : "4.5rem" } as CSSProperties}
        className={`relative isolate flex shrink-0 flex-col overflow-hidden rounded-card transition-[width] delay-150 duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none lg:w-[var(--panel-w)] ${
          open ? "h-[65dvh] min-h-[20rem] border-[1.5px] border-ink lg:h-auto" : "bg-surface"
        }`}
      >
        {!open ? (
          // Closed: a slim strip (wide screens) or a bar (phones).
          <div className="panel-in flex items-center justify-between gap-3 p-3 lg:h-full lg:flex-col lg:justify-start lg:gap-5 lg:px-0 lg:py-4">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={`Show bought (${bought.length})`}
              title="Show bought"
              className="flex items-center gap-2 rounded-control bg-accent px-4 py-2.5 font-semibold text-accent-ink transition-opacity hover:opacity-90 lg:size-11 lg:justify-center lg:p-0"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="lg:sr-only">Show bought</span>
            </button>
            <p className="text-sm text-muted lg:rotate-180 lg:[writing-mode:vertical-rl]">Bought · {bought.length}</p>
          </div>
        ) : (
          <div className="panel-in flex min-h-0 flex-1 flex-col">
            <Mascot name="meowth-alolan" corner="right" />
            <BoxHeader title="Bought" count={bought.length}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Hide bought"
                title="Hide"
                className="grid size-8 place-items-center rounded-control text-muted transition-colors hover:bg-surface hover:text-ink"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </BoxHeader>
            <Scroller empty={bought.length === 0 ? "Nothing bought yet." : null}>
              {byDay(bought).map((d) => (
                <DayGroup key={d.date} date={d.date}>
                  {d.items.map((i) => (
                    <Item key={i.id} item={i} focused={i.id === focusId} />
                  ))}
                </DayGroup>
              ))}
            </Scroller>
          </div>
        )}
      </section>
    </div>
  );
}

function BoxHeader({ title, count, children }: { title: string; count: number; children?: ReactNode }) {
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
function Scroller({ empty, children }: { empty: string | null; children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  return (
    <div className="relative min-h-0 flex-1">
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 z-10 h-5 bg-gradient-to-b from-paper to-transparent transition-opacity duration-200 ${
          scrolled ? "opacity-100" : "opacity-0"
        }`}
      />
      <div onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)} className="absolute inset-0 overflow-y-auto px-3 pb-4 sm:px-4">
        {empty ? <p className="mt-1 rounded-card border border-dashed border-line px-5 py-6 text-muted">{empty}</p> : children}
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
    <section aria-label={title} className={`relative isolate flex min-w-0 flex-col overflow-hidden rounded-card border-[1.5px] border-ink ${className}`}>
      {/* Mascot: the list's bottom-left corner (Alolan Meowth sits in the Bought box). See Mascot.tsx to tweak. */}
      <Mascot name="meowth" corner="left" />
      <BoxHeader title={title} count={count} />
      <Scroller empty={count === 0 ? empty : null}>{children}</Scroller>
      {/* The veil (wide screens): covers this list while the Bought panel slides. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 z-20 hidden bg-surface transition-opacity ease-out motion-reduce:hidden lg:block ${
          veiled ? "opacity-100 duration-150" : "opacity-0 duration-300"
        }`}
      />
    </section>
  );
}

// One day: its date, then its items.
function DayGroup({ date, children }: { date: string; children: ReactNode }) {
  return (
    <div className="pt-2 first:pt-0">
      <h3 className="num px-1 pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{dayLabel(date)}</h3>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  );
}

function Item({ item, focused }: { item: ShoppingItem; focused: boolean }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const ref = useRef<HTMLLIElement>(null);

  // Arrived from a search result: scroll its box to it while it flashes.
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focused]);

  async function remove() {
    const ok = await confirm({ title: `Delete "${item.name}"?`, body: "It'll be removed for good.", confirmLabel: "Delete" });
    if (ok) startTransition(() => deleteShoppingItem(item.id));
  }

  if (editing) {
    return (
      <li className="rounded-card bg-surface p-3 ring-1 ring-line">
        <ShoppingForm item={item} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li
      ref={ref}
      className={`group flex items-center gap-3 rounded-card bg-surface/80 px-3 py-2 transition-opacity ${pending ? "opacity-40" : ""} ${
        focused ? "flash" : ""
      }`}
    >
      {/* Check it off (moves it to Bought) / put it back. */}
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => setBought(item.id, !item.bought, todayKey()))}
        aria-label={item.bought ? `Put "${item.name}" back on the list` : `Mark "${item.name}" as bought`}
        title={item.bought ? "Put back on the list" : "Bought it"}
        className={`grid size-6 shrink-0 place-items-center rounded-full border-[1.5px] transition-colors ${
          item.bought ? "border-accent bg-accent text-accent-ink hover:opacity-80" : "border-muted/60 text-transparent hover:border-accent hover:text-accent"
        }`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="min-w-0 flex-1">
        <p className={`break-words ${item.bought ? "text-muted" : "text-ink"}`}>
          {item.link ? (
            <a
              href={item.link}
              target="_blank"
              rel="noreferrer"
              title={item.link}
              className="underline decoration-accent/40 underline-offset-[3px] transition-colors hover:decoration-accent"
            >
              {item.name}
              <span aria-hidden="true" className="ml-1 text-xs text-muted">
                ↗
              </span>
            </a>
          ) : (
            item.name
          )}
        </p>
      </div>

      {item.price && <span className="num shrink-0 text-sm text-muted">{showPrice(item.price)}</span>}

      <div className="-my-1 -mr-1 flex shrink-0">
        <button
          type="button"
          disabled={pending}
          onClick={() => setEditing(true)}
          aria-label={`Edit ${item.name}`}
          className="grid size-8 place-items-center rounded-control text-muted opacity-50 transition hover:bg-paper group-hover:text-black group-hover:opacity-100"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={remove}
          aria-label={`Delete ${item.name}`}
          className="grid size-8 place-items-center rounded-control text-muted opacity-50 transition hover:bg-paper hover:text-danger! group-hover:text-black group-hover:opacity-100"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </li>
  );
}
