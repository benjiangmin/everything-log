"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { deleteGift, setGiftStatus } from "@/app/christmas/actions";
import type { Gift, GiftStatus, Person } from "@/lib/christmas";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useIsStuck } from "@/components/ui/useIsStuck";
import GiftForm from "./GiftForm";
import { money } from "./money";
import Mascot from "@/components/ui/Mascot";

const NEXT: Record<GiftStatus, GiftStatus> = { todo: "bought", bought: "arrived", arrived: "todo" };
const LABEL: Record<GiftStatus, string> = { todo: "To buy", bought: "Bought", arrived: "Arrived" };

// The year's people, one under another, each a card with their gifts and their total.
export default function GiftList({ year, people, names, focusId }: { year: number; people: Person[]; names: string[]; focusId?: string }) {
  const all = people.flatMap((p) => p.gifts).filter((g) => g.item);
  const counts = { todo: 0, bought: 0, arrived: 0 };
  for (const g of all) counts[g.status] += 1;
  const [headRef, stuck] = useIsStuck<HTMLDivElement>();

  return (
    // The box is two pieces stacked, so its borders always line up exactly: the title row (top edge +
    // sides, rounded top) and the body (sides + bottom edge, rounded bottom).
    <section aria-label={`Christmas ${year}`} className="relative mt-5">
      {/* The title row pins just under the page's title/search bar while you scroll, keeping the box's
          top edge with it, and shows a soft shadow under itself once pinned. The outer strip is paper
          so nothing peeks past its rounded corners. */}
      <div ref={headRef} data-stick-under className="sticky top-[var(--sticky-top,0px)] z-10 bg-paper">
        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-t-card border-x-[1.5px] border-t-[1.5px] border-ink px-4 pb-3 pt-4 sm:px-5">
          <h2 className="font-display text-xl font-semibold">
            {people.length} {people.length === 1 ? "person" : "people"}
          </h2>
          {/* What the three statuses look like, with how many of each. */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {(["todo", "bought", "arrived"] as const).map((s) => (
              <span key={s} className={`rounded-full px-2.5 py-1 font-semibold ${PILL[s]}`}>
                {LABEL[s]} · {counts[s]}
              </span>
            ))}
          </div>
        </div>
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-[1.5px] top-full h-6 bg-gradient-to-b from-paper to-transparent transition-opacity duration-200 ${
            stuck ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>

      <div className="relative isolate overflow-clip rounded-b-card border-x-[1.5px] border-b-[1.5px] border-ink px-3 pb-3 sm:px-4 sm:pb-4">
        {/* Mascot: Delibird in the bottom-left corner, turned to face in (see Mascot.tsx to tweak). */}
        <Mascot name="delibird" corner="left" className="-scale-x-100" />
        {people.length === 0 ? (
          <p className="rounded-card border border-dashed border-line px-5 py-8 text-center text-muted">No gifts for {year} yet. Add one above.</p>
        ) : (
          <div className="relative z-[1] space-y-3">
            {people.map((p) => (
              <PersonCard key={p.name} person={p} names={names} focusId={focusId} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// To buy: outlined. Bought: soft coffee. Arrived: solid coffee with a check.
const PILL: Record<GiftStatus, string> = {
  todo: "border border-dashed border-muted/60 text-muted",
  bought: "bg-accent/15 text-accent ring-1 ring-accent/40",
  arrived: "bg-accent text-accent-ink",
};

function PersonCard({ person, names, focusId }: { person: Person; names: string[]; focusId?: string }) {
  const gifts = person.gifts.filter((g) => g.item || g.price || g.link);
  const placeholder = person.gifts.find((g) => !g.item && !g.price && !g.link);
  return (
    <article className="rounded-card bg-surface/80 p-3 sm:p-4">
      <header className="flex items-baseline justify-between gap-3 px-1">
        <h3 className="min-w-0 truncate font-display text-lg font-semibold">{person.name}</h3>
        <p className="num shrink-0 font-semibold text-ink/80">{money(person.total)}</p>
      </header>
      {gifts.length === 0 ? (
        <div className="mt-1 flex items-center justify-between px-1">
          <p className="text-sm text-muted">Nothing picked yet.</p>
          {placeholder && <GiftActions gift={placeholder} names={names} compact />}
        </div>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {gifts.map((g) => (
            <GiftRow key={g.id} gift={g} names={names} focused={g.id === focusId} />
          ))}
        </ul>
      )}
    </article>
  );
}

function GiftRow({ gift, names, focused }: { gift: Gift; names: string[]; focused: boolean }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focused]);

  if (editing) {
    return (
      <li className="rounded-control bg-paper p-3 ring-1 ring-line">
        <GiftForm year={gift.year} names={names} gift={gift} onDone={() => setEditing(false)} />
      </li>
    );
  }

  const arrived = gift.status === "arrived";
  return (
    <li
      ref={ref}
      className={`group flex items-center gap-2.5 rounded-control bg-paper/70 px-2 py-1.5 transition-opacity ${pending ? "opacity-40" : ""} ${
        focused ? "flash" : ""
      }`}
    >
      {/* The status: click to move it along (To buy → Bought → Arrived → To buy). */}
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => setGiftStatus(gift.id, NEXT[gift.status]))}
        title={`${LABEL[gift.status]} (click for ${LABEL[NEXT[gift.status]].toLowerCase()})`}
        aria-label={`${LABEL[gift.status]}. Change to ${LABEL[NEXT[gift.status]]}`}
        className={`flex w-[5.5rem] shrink-0 items-center justify-center gap-1 rounded-full py-1 text-[11px] font-semibold uppercase tracking-wide transition-opacity hover:opacity-80 ${PILL[gift.status]}`}
      >
        {arrived && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {LABEL[gift.status]}
      </button>

      <p className={`min-w-0 flex-1 break-words ${arrived ? "text-ink/70" : "text-ink"}`}>
        {gift.link ? (
          <a
            href={gift.link}
            target="_blank"
            rel="noreferrer"
            title={gift.link}
            className="underline decoration-accent/40 underline-offset-[3px] transition-colors hover:decoration-accent"
          >
            {gift.item ?? "Link"}
            <span aria-hidden="true" className="ml-1 text-xs text-muted">
              ↗
            </span>
          </a>
        ) : (
          (gift.item ?? <span className="text-muted">(no gift written)</span>)
        )}
      </p>
      {gift.price !== null && <span className="num shrink-0 text-sm text-muted">{money(gift.price)}</span>}
      <GiftActions gift={gift} names={names} onEdit={() => setEditing(true)} />
    </li>
  );
}

// Edit (pencil) + delete (×). `compact` = for an empty person (only delete).
function GiftActions({ gift, onEdit, compact }: { gift: Gift; names: string[]; onEdit?: () => void; compact?: boolean }) {
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  async function remove() {
    const ok = await confirm({
      title: compact ? `Remove ${gift.person}?` : `Delete "${gift.item ?? "this gift"}"?`,
      body: compact ? `They'll be taken off ${gift.year}'s list.` : "It'll be removed for good.",
      confirmLabel: "Delete",
    });
    if (ok) startTransition(() => deleteGift(gift.id));
  }
  const btn =
    "grid size-7 place-items-center rounded-control text-muted opacity-50 transition hover:bg-surface group-hover:text-black group-hover:opacity-100";
  return (
    <div className="group -my-1 flex shrink-0">
      {!compact && (
        <button type="button" disabled={pending} onClick={onEdit} aria-label="Edit" className={btn}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      <button type="button" disabled={pending} onClick={remove} aria-label="Delete" className={`${btn} hover:text-danger!`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
