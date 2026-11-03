"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { deletePrayer } from "@/app/prayer/actions";
import type { Prayer } from "@/lib/prayers";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import PrayerForm from "./PrayerForm";
import Mascot from "@/components/ui/Mascot";

function longDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// The words only, for a prayer without a title.
const plain = (html: string) =>
  html
    .replace(/<\/p>|<\/li>|<br>/g, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

// Every prayer, newest first, in a bordered box that scrolls inside itself (on wide screens it fills
// the height). Each starts folded to its title + date.
export default function PrayerList({ prayers, focusId }: { prayers: Prayer[]; focusId?: string }) {
  const [scrolled, setScrolled] = useState(false);

  return (
    <section
      aria-label="Prayers"
      className="relative isolate flex h-[70dvh] min-h-[24rem] min-w-0 flex-col overflow-hidden rounded-card border-[1.5px] border-ink lg:h-auto lg:min-h-0 lg:flex-1"
    >
      {/* Mascot: pinned to the box's bottom-right corner (see Mascot.tsx to tweak). */}
      <Mascot name="darmanitan-zen" corner="right" />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 z-10 h-5 bg-gradient-to-b from-paper to-transparent transition-opacity duration-200 ${
          scrolled ? "opacity-100" : "opacity-0"
        }`}
      />
      <div onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)} className="relative z-[1] min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {prayers.length === 0 ? (
          <p className="py-10 text-center text-muted">No prayers yet.</p>
        ) : (
          <ul className="space-y-2">
            {prayers.map((p) => (
              <Item key={p.id} prayer={p} focused={p.id === focusId} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Item({ prayer, focused }: { prayer: Prayer; focused: boolean }) {
  const [open, setOpen] = useState(focused); // folded by default (a search result opens itself)
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const ref = useRef<HTMLLIElement>(null);
  const heading = prayer.title || plain(prayer.body).slice(0, 80);

  // Arrived from a search result: scroll the box to it while it flashes.
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [focused]);

  async function remove() {
    const ok = await confirm({ title: "Delete this prayer?", body: `"${heading.slice(0, 80)}" will be removed for good.`, confirmLabel: "Delete" });
    if (ok) startTransition(() => deletePrayer(prayer.id));
  }

  if (editing) {
    return (
      <li className="rounded-card bg-surface p-3 ring-1 ring-line sm:p-4">
        <PrayerForm prayer={prayer} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li
      ref={ref}
      className={`group rounded-card bg-surface/80 px-3 py-2.5 transition-opacity sm:px-4 ${pending ? "opacity-40" : ""} ${focused ? "flash" : ""}`}
    >
      <div className="flex items-start gap-3">
        {/* Title + date: click to open / fold the prayer. */}
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-w-0 flex-1 items-start gap-2 text-left">
          <span className="min-w-0 flex-1">
            <span className={`block break-words leading-snug ${prayer.title ? "font-semibold text-ink" : "italic text-ink/80"}`}>{heading}</span>
            <span className="num mt-0.5 block text-xs text-muted">{prayer.prayed_on ? longDate(prayer.prayed_on) : "No date"}</span>
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className={`mt-1 shrink-0 text-muted/70 transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="-my-1 -mr-1 flex shrink-0">
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
      </div>

      {open && (
        // The prayer: saved text is cleaned to paragraphs, bold/italic/underline and lists before it gets here.
        <div
          className="dream-text mt-2 break-words border-t border-accent/20 pt-2.5 leading-relaxed text-ink"
          dangerouslySetInnerHTML={{ __html: prayer.body }}
        />
      )}
    </li>
  );
}
