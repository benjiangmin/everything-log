"use client";

import { useEffect, useState, useTransition } from "react";
import { addFromInbox, dismissFromInbox, getInbox } from "@/app/budget/inbox-actions";
import type { InboxItem } from "@/lib/budget-inbox";
import type { Category } from "@/lib/budget";
import CategoryPicker from "./CategoryPicker";
import DateWheel from "@/components/ui/DateWheel";

// The review list that slides in from the right: purchases read from your alert emails.
// Each one: fix anything you like, then + Add (becomes an expense) or Dismiss.
export default function InboxPanel({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<{ items: InboxItem[]; categories: Category[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getInbox().then((res) => {
      if (!live) return;
      if ("error" in res) setError(res.error);
      else setData(res);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const done = (id: string) => {
    setData((d) => d && { ...d, items: d.items.filter((i) => i.id !== id) });
    onChanged();
  };

  const count = data?.items.length ?? 0;
  const other = data?.categories.find((c) => c.name.trim().toLowerCase() === "other")?.id;

  return (
    <div className="fixed inset-0 z-[70]">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/30" />
      <aside
        aria-label="New purchases"
        className="panel-slide absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-paper shadow-2xl shadow-ink/30"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="font-display text-xl font-semibold">New purchases</h2>
            <p className="text-sm text-muted">
              {data ? (count ? `${count} to review` : "All caught up") : error ? "" : "Loading…"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-control text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-width:thin]">
          {error && <p className="rounded-card bg-surface px-4 py-3 text-sm text-danger">{error}</p>}
          {data && count === 0 && (
            <p className="rounded-card border border-dashed border-line px-5 py-8 text-center text-muted">
              Nothing new. Purchases show up here as their emails come in.
            </p>
          )}
          <ul className="space-y-3 pb-40">
            {data?.items.map((item) =>
              item.source ? (
                <PurchaseCard key={item.id} item={item} categories={data.categories} defaultCategory={other} onDone={() => done(item.id)} />
              ) : (
                <UnreadCard key={item.id} item={item} onDone={() => done(item.id)} />
              ),
            )}
          </ul>
        </div>
      </aside>
    </div>
  );
}

const field =
  "w-full rounded-control border border-line bg-paper px-3 py-2.5 text-ink placeholder:text-muted/70 focus:border-ink focus:outline-none";

function shortDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function PurchaseCard({
  item,
  categories,
  defaultCategory,
  onDone,
}: {
  item: InboxItem;
  categories: Category[];
  defaultCategory?: number;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const date = item.spent_on ?? item.received_at.slice(0, 10);
  const note = [item.merchant, item.note].filter(Boolean).join(" · ").slice(0, 120);

  return (
    <li className={`rounded-card bg-surface p-4 transition-opacity ${pending ? "opacity-50" : ""}`}>
      <form
        action={(formData) =>
          start(async () => {
            const res = await addFromInbox(item.id, formData);
            if (res.ok) onDone();
            else setMessage(res.message);
          })
        }
        className="flex flex-col gap-3"
      >
        <p className="flex items-baseline gap-2 text-sm text-muted">
          <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-semibold text-ink">{item.source}</span>
          <span>{shortDate(date)}</span>
          <span className="min-w-0 truncate">· {item.merchant}</span>
        </p>

        <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
          <label>
            <span className="sr-only">Amount</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
              <input
                name="amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                required
                defaultValue={item.amount?.toFixed(2)}
                className={`${field} num no-spin pl-7`}
              />
            </div>
          </label>
          <label>
            <span className="sr-only">Notes</span>
            <input name="note" type="text" maxLength={120} defaultValue={note} className={field} />
          </label>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-2">
          <CategoryPicker name="category_id" categories={categories} defaultValue={defaultCategory} />
          <DateWheel name="spent_on" defaultValue={date} noYear />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-1.5 rounded-control bg-accent px-4 py-2 font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            Add
          </button>
          <DismissButton id={item.id} disabled={pending} onDone={onDone} onError={setMessage} />
          {message && <p className="text-sm text-danger">{message}</p>}
        </div>
      </form>
    </li>
  );
}

// An email that came in but couldn't be read (a new kind of alert, Gmail's forwarding code…).
function UnreadCard({ item, onDone }: { item: InboxItem; onDone: () => void }) {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <li className="rounded-card border border-dashed border-line p-4">
      <p className="text-sm font-semibold text-ink">Couldn&apos;t read this email</p>
      <p className="mt-1 break-words text-sm text-muted">
        {item.subject || "(no subject)"} · {item.from_addr}
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer text-sm text-muted hover:text-ink">Show email</summary>
        <p className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap break-words rounded-control bg-surface p-3 text-sm text-ink">
          {item.body_text || "(empty)"}
        </p>
      </details>
      <div className="mt-3 flex items-center gap-2">
        <DismissButton id={item.id} onDone={onDone} onError={setMessage} />
        {message && <p className="text-sm text-danger">{message}</p>}
      </div>
    </li>
  );
}

function DismissButton({
  id,
  disabled,
  onDone,
  onError,
}: {
  id: string;
  disabled?: boolean;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={() =>
        start(async () => {
          const res = await dismissFromInbox(id);
          if (res.ok) onDone();
          else onError(res.message);
        })
      }
      className="rounded-control px-3 py-2 text-sm text-muted transition-colors hover:bg-paper hover:text-ink disabled:opacity-60"
    >
      {pending ? "…" : "Dismiss"}
    </button>
  );
}
