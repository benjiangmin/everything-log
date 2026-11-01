"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { deletePersonItem, setPersonPinned } from "@/app/person/actions";
import type { PersonItem } from "@/lib/person";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import PersonForm from "./PersonForm";

// The black-bordered box. Pinned things on top; everything else folded behind
// "Expand for more details" (it opens by itself when a search result is in there).
// Fills the rest of the screen and scrolls inside itself. Phones: a fixed share of the screen.
export default function PersonList({ items, focusId }: { items: PersonItem[]; focusId?: string }) {
  const [scrolled, setScrolled] = useState(false);
  const pinned = items.filter((i) => i.pinned);
  const rest = items.filter((i) => !i.pinned);
  const [open, setOpen] = useState(() => rest.some((i) => i.id === focusId));

  // Picked a folded one from search while already on the page: unfold.
  const [seenFocus, setSeenFocus] = useState(focusId);
  if (focusId !== seenFocus) {
    setSeenFocus(focusId);
    if (rest.some((i) => i.id === focusId)) setOpen(true);
  }

  return (
    <section
      aria-label="The person"
      className="relative mb-6 mt-5 flex h-[70dvh] min-h-[20rem] flex-col overflow-hidden rounded-card border-[1.5px] border-ink md:h-auto md:flex-1 md:basis-0"
    >
      {/* Mascots go here, pinned to the box's bottom corners (behind the cards, trimmed by the border), e.g.
          <img src="/name.png" alt="" aria-hidden="true"
               className="pointer-events-none absolute -bottom-4 -left-6 z-0 w-32 select-none opacity-60 sm:w-40" /> */}

      {/* Fade at the top once the list has scrolled. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 z-10 h-5 bg-gradient-to-b from-paper to-transparent transition-opacity duration-200 ${
          scrolled ? "opacity-100" : "opacity-0"
        }`}
      />
      <div onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)} className="relative z-[1] min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {items.length === 0 ? (
          <p className="py-10 text-center text-muted">Nothing on the list yet.</p>
        ) : (
          <>
            {pinned.length > 0 && (
              <ul className="space-y-2">
                {pinned.map((t) => (
                  <Item key={t.id} item={t} focused={t.id === focusId} />
                ))}
              </ul>
            )}

            {rest.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setOpen((o) => !o)}
                  aria-expanded={open}
                  className={`flex w-full items-center gap-2 rounded-control px-2 py-2 text-left text-sm font-semibold text-muted transition-colors hover:bg-surface hover:text-ink ${
                    pinned.length > 0 ? "mt-3" : ""
                  }`}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                    className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
                  >
                    <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {open ? "Hide the details" : "Expand for more details"}
                  <span className="font-normal opacity-70">{rest.length}</span>
                </button>
                {open && (
                  <ul className="mt-1 space-y-2">
                    {rest.map((t) => (
                      <Item key={t.id} item={t} focused={t.id === focusId} />
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}

// Text with any web links in it made clickable (shown short: "youtube.com/@LenaLemon").
function Linkified({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(/https?:\/\/[^\s)]+/g)) {
    const url = m[0];
    parts.push(text.slice(last, m.index));
    parts.push(
      <a
        key={m.index}
        href={url}
        target="_blank"
        rel="noreferrer"
        className="underline decoration-accent/40 underline-offset-[3px] transition-colors hover:decoration-accent"
      >
        {url.replace(/^https?:\/\/(www\.)?/, "")}
      </a>,
    );
    last = m.index + url.length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

function Item({ item, focused }: { item: PersonItem; focused: boolean }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const ref = useRef<HTMLLIElement>(null);

  // Arrived from a search result: scroll the box to it (centered) while it flashes.
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focused]);

  async function remove() {
    const ok = await confirm({ title: "Delete this one?", body: `"${item.body.slice(0, 80)}" will be removed for good.`, confirmLabel: "Delete" });
    if (ok) startTransition(() => deletePersonItem(item.id));
  }

  if (editing) {
    return (
      <li className="rounded-card bg-surface p-3 ring-1 ring-line">
        <PersonForm item={item} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li
      ref={ref}
      className={`group grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 rounded-card px-3 py-2.5 transition-opacity sm:px-4 ${
        item.pinned ? "bg-accent/10" : "bg-surface/80"
      } ${pending ? "opacity-40" : ""} ${focused ? "flash" : ""}`}
    >
      <p className={`break-words leading-relaxed text-ink ${item.pinned ? "font-semibold" : ""}`}>
        <Linkified text={item.body} />
      </p>
      <div className="-my-1 -mr-1 flex">
        {/* Pin: keep it on top, above "Expand for more details". */}
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => setPersonPinned(item.id, !item.pinned))}
          aria-label={item.pinned ? "Unpin (fold it away with the rest)" : "Pin to the top"}
          title={item.pinned ? "Unpin" : "Pin to the top"}
          className={`grid size-8 place-items-center rounded-control transition hover:bg-paper ${
            item.pinned ? "text-accent" : "text-muted opacity-50 group-hover:text-black group-hover:opacity-100"
          }`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill={item.pinned ? "currentColor" : "none"} aria-hidden="true">
            <path
              d="M9 4h6l-1 6 4 4H6l4-4-1-6zM12 14v6"
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
          onClick={() => setEditing(true)}
          aria-label="Edit"
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
          aria-label="Delete"
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
