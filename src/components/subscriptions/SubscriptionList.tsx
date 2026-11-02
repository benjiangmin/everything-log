"use client";

import { useState, useTransition } from "react";
import { deleteSubscription, setCancelled } from "@/app/subscriptions/actions";
import type { Subscription } from "@/lib/subscriptions";
import { billedOn, dollars, perMonth } from "@/lib/subscription-dates";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import SubscriptionForm from "./SubscriptionForm";

// Every subscription in a bordered box that scrolls inside itself: running ones first (soonest
// charge on top), then the cancelled ones, faded.
export default function SubscriptionList({ subs, veiled = false }: { subs: Subscription[]; veiled?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const active = subs.filter((s) => !s.cancelled);
  const cancelled = subs.filter((s) => s.cancelled);
  const monthlyOnes = active.filter((s) => s.cycle === "monthly").reduce((n, s) => n + s.price, 0);
  const yearlyOnes = active.filter((s) => s.cycle === "yearly").reduce((n, s) => n + s.price, 0);
  const total = active.reduce((n, s) => n + perMonth(s.price, s.cycle), 0);

  return (
    <section
      aria-label="Subscriptions"
      className="relative flex h-[70dvh] min-h-[24rem] min-w-0 flex-col overflow-hidden rounded-card border-[1.5px] border-ink lg:h-auto lg:min-h-0 lg:flex-1"
    >
      {/* Mascots go here, pinned to the box (behind the list, trimmed by the border), e.g.
          <img src="/name.png" alt="" aria-hidden="true"
               className="pointer-events-none absolute -bottom-4 -right-6 w-32 select-none opacity-60 sm:w-40" /> */}

      {/* Totals: always visible at the top of the box. */}
      <div className="relative z-10 flex shrink-0 flex-wrap items-baseline justify-between gap-x-6 gap-y-1 bg-paper px-5 pb-3 pt-4 sm:px-6">
        <h2 className="font-display text-xl font-semibold">
          {active.length} {active.length === 1 ? "subscription" : "subscriptions"}
        </h2>
        {active.length > 0 && (
          <p className="num text-sm text-muted">
            {dollars(monthlyOnes)}/mo + {dollars(yearlyOnes)}/yr ≈ <span className="font-semibold text-ink">{dollars(total)}/mo</span>
          </p>
        )}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 top-full h-5 bg-gradient-to-b from-paper to-transparent transition-opacity duration-200 ${
            scrolled ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>

      <div onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)} className="relative z-[1] min-h-0 flex-1 overflow-y-auto px-3 pb-4 sm:px-4">
        {active.length === 0 ? (
          <p className="mt-1 rounded-card border border-dashed border-line px-5 py-6 text-muted">Nothing yet. Add your first subscription on the left.</p>
        ) : (
          <ul className="space-y-2">
            {active.map((s) => (
              <Item key={s.id} sub={s} />
            ))}
          </ul>
        )}

        {cancelled.length > 0 && (
          <>
            <h3 className="mb-2 mt-6 px-1 text-sm font-semibold text-muted">Cancelled</h3>
            <ul className="space-y-2 opacity-55">
              {cancelled.map((s) => (
                <Item key={s.id} sub={s} />
              ))}
            </ul>
          </>
        )}
      </div>

      {/* The veil (wide screens): covers the list while the add box slides. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 z-20 hidden bg-surface transition-opacity ease-out motion-reduce:hidden lg:block ${
          veiled ? "opacity-100 duration-150" : "opacity-0 duration-300"
        }`}
      />
    </section>
  );
}

function Item({ sub }: { sub: Subscription }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();

  async function remove() {
    const ok = await confirm({ title: "Delete this subscription?", body: `"${sub.name}" will be removed for good.`, confirmLabel: "Delete" });
    if (ok) startTransition(() => deleteSubscription(sub.id));
  }

  if (editing) {
    return (
      <li className="rounded-card bg-surface p-3 ring-1 ring-line sm:p-4">
        <SubscriptionForm sub={sub} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className={`group flex items-center gap-3 rounded-card bg-surface/80 px-3 py-2.5 transition-opacity sm:px-4 ${pending ? "opacity-40" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className={`break-words font-semibold leading-snug text-ink ${sub.cancelled ? "line-through decoration-muted/60" : ""}`}>
          {sub.link ? (
            // Has a link: the name opens it (e.g. the page to manage or cancel it).
            <a
              href={sub.link}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-accent/30 underline-offset-[3px] transition-colors hover:decoration-accent"
            >
              {sub.name}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="ml-1 inline align-baseline text-muted">
                <path d="M7 17L17 7M9 7h8v8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          ) : (
            sub.name
          )}
        </p>
        <p className="mt-0.5 break-words text-xs text-muted">
          {sub.cancelled ? "Cancelled" : sub.next_charge ? billedOn(sub.next_charge, sub.cycle) : sub.cycle === "yearly" ? "Yearly" : "Monthly"}
          {sub.note && <> · {sub.note}</>}
        </p>
      </div>

      <p className="num shrink-0 text-right font-semibold text-ink">
        {dollars(sub.price)}
        <span className="text-xs font-normal text-muted">/{sub.cycle === "yearly" ? "yr" : "mo"}</span>
      </p>

      <div className="-my-1 -mr-1 flex shrink-0">
        <IconButton label="Edit" disabled={pending} onClick={() => setEditing(true)}>
          <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />
        </IconButton>
        {/* Cancelled ↔ running. */}
        <IconButton
          label={sub.cancelled ? "Restore (still paying)" : "Mark cancelled"}
          disabled={pending}
          onClick={() => startTransition(() => setCancelled(sub.id, !sub.cancelled))}
        >
          {sub.cancelled ? <path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v4h4" /> : <path d="M6 6l12 12M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" />}
        </IconButton>
        <IconButton label="Delete" disabled={pending} onClick={remove} danger>
          <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
        </IconButton>
      </div>
    </li>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  danger,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid size-8 place-items-center rounded-control text-muted opacity-50 transition hover:bg-paper group-hover:text-black group-hover:opacity-100 ${
        danger ? "hover:text-danger!" : ""
      }`}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}
