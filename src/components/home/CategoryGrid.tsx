"use client";

import Link from "next/link";
import AlertDot from "./AlertDot";
import { useState, useTransition } from "react";
import { addCategory, deleteCategory, renameCategory, reorderCategories } from "@/app/home-actions";
import type { HomeCategory } from "@/lib/home";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import SortableGrid from "./SortableGrid";
import { AddCard, DeleteButton, Empty, InlineInput, PageHeader, useLocalCopy } from "./bits";

// The home page: one card per category. Click a card to open it.
// "Edit" turns on dragging, renaming, deleting and adding.
// alerts: the categories with something inside that needs attention (they get a red "!").
export default function CategoryGrid({ categories, alerts = [] }: { categories: HomeCategory[]; alerts?: string[] }) {
  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useLocalCopy(categories);
  const [, startTransition] = useTransition();
  const confirm = useConfirm();

  async function remove(c: HomeCategory) {
    const ok = await confirm({
      title: `Delete "${c.name}"?`,
      body:
        c.item_count > 0
          ? `Its ${c.item_count} ${c.item_count === 1 ? "page" : "pages"} will be removed from the home screen too. Your data inside them (like budget entries) stays.`
          : undefined,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setOrder((o) => o.filter((x) => x.id !== c.id));
    startTransition(() => deleteCategory(c.id));
  }

  return (
    <>
      <PageHeader title="Home" editing={editing} onToggle={() => setEditing((e) => !e)} />

      <div className="mt-8">
        {order.length === 0 && !editing ? (
          <Empty>No categories yet. Press Edit to add one.</Empty>
        ) : (
          <SortableGrid
            id="home-categories"
            items={order}
            editing={editing}
            onReorder={(next) => {
              setOrder(next);
              startTransition(() => reorderCategories(next.map((c) => c.id)));
            }}
            className="grid gap-3 sm:grid-cols-2"
            after={editing && <AddCard label="Add category" onAdd={(name) => startTransition(() => addCategory(name))} />}
            render={(c, handle) =>
              editing ? (
                <div className="flex min-h-20 items-center gap-1 rounded-card bg-surface py-3 pl-2 pr-2">
                  {handle}
                  <InlineInput
                    value={c.name}
                    label="Category name"
                    onSave={(name) => {
                      setOrder((o) => o.map((x) => (x.id === c.id ? { ...x, name } : x)));
                      startTransition(() => renameCategory(c.id, name));
                    }}
                    className="flex-1 font-display text-lg font-semibold"
                  />
                  <DeleteButton label={`Delete ${c.name}`} onClick={() => remove(c)} />
                </div>
              ) : (
                <Link
                  href={`/c/${c.id}`}
                  className="group relative flex min-h-20 items-center justify-between gap-3 rounded-card bg-surface p-5 transition-colors hover:bg-line/70"
                >
                  {alerts.includes(c.id) && <AlertDot label="Something in here needs you" />}
                  <div className="min-w-0">
                    <p className="truncate font-display text-lg font-semibold">{c.name}</p>
                    <p className="mt-0.5 text-sm text-muted">
                      {c.item_count === 0 ? "Empty" : `${c.item_count} ${c.item_count === 1 ? "page" : "pages"}`}
                    </p>
                  </div>
                  <span aria-hidden="true" className="text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ink">
                    →
                  </span>
                </Link>
              )
            }
          />
        )}
      </div>
    </>
  );
}
