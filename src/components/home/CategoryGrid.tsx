"use client";

import Link from "next/link";
import AlertDot from "./AlertDot";
import { useState, useTransition, type ReactNode } from "react";
import {
  addCategory,
  addHomeSection,
  deleteCategory,
  deleteHomeSection,
  renameCategory,
  renameHomeSection,
  saveHomeLayout,
  setHomeDescription,
} from "@/app/home-actions";
import type { HomeCategory, HomeSection } from "@/lib/home";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import SectionBoard, { type Group } from "./SectionBoard";
import { AddCard, DeleteButton, Empty, InlineInput, PageHeader, useLocalCopy } from "./bits";

// The home page: a memo under "Home", then one card per category, split into sections
// (subcategories) the same way a category's own page is. Click a card to open it.
// "Edit" turns on the memo, dragging (categories and whole sections), renaming, deleting and adding.
// alerts: the categories with something inside that needs attention (they get a red "!").
export default function CategoryGrid({
  categories,
  sections,
  description: savedDescription,
  children,
  alerts = [],
}: {
  categories: HomeCategory[];
  sections: HomeSection[];
  description: string | null;
  children?: ReactNode; // shown right under the Home bar (Minute by Minute)
  alerts?: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useLocalCopy(categories);
  const [secs, setSecs] = useLocalCopy(sections);
  const [description, setDescription] = useLocalCopy(savedDescription);
  const [, startTransition] = useTransition();
  const confirm = useConfirm();

  const byId = new Map(order.map((c) => [c.id, c]));
  // "No section" first, then each section, each with its categories in order.
  const groups: Group[] = [
    { id: null, name: "", itemIds: order.filter((c) => !c.section_id || !secs.some((s) => s.id === c.section_id)).map((c) => c.id) },
    ...secs.map((s) => ({ id: s.id, name: s.name, itemIds: order.filter((c) => c.section_id === s.id).map((c) => c.id) })),
  ];

  // After a drag: rebuild the local order from the groups, then save the whole layout.
  function saveLayout(next: Group[]) {
    const flat = next.flatMap((g) => g.itemIds.map((id) => ({ ...byId.get(id)!, section_id: g.id })));
    const nextSecs = next.slice(1).map((g) => secs.find((s) => s.id === g.id)!);
    setOrder(flat);
    setSecs(nextSecs);
    startTransition(() =>
      saveHomeLayout(
        nextSecs.map((s) => s.id),
        flat.map((c) => ({ id: c.id, section_id: c.section_id })),
      ),
    );
  }

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

  async function removeSection(section: HomeSection) {
    const count = order.filter((c) => c.section_id === section.id).length;
    const ok = await confirm({
      title: `Delete the "${section.name}" subcategory?`,
      body: count ? `Its ${count} ${count === 1 ? "category moves" : "categories move"} back to the top (nothing else is deleted).` : undefined,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setSecs((ss) => ss.filter((x) => x.id !== section.id));
    setOrder((o) => o.map((c) => (c.section_id === section.id ? { ...c, section_id: null } : c)));
    startTransition(() => deleteHomeSection(section.id));
  }

  return (
    <>
      <PageHeader
        sticky
        title="Home"
        editing={editing}
        onToggle={() => setEditing((e) => !e)}
        description={description}
        onDescription={(d) => {
          setDescription(d || null);
          startTransition(() => setHomeDescription(d));
        }}
      />
      {children}

      <div className="mt-8">
        {order.length === 0 && secs.length === 0 && !editing ? (
          <Empty>No categories yet. Press Edit to add one.</Empty>
        ) : (
          <SectionBoard
            stickyTop="calc(var(--home-bar-h, 0px) + var(--home-todo-h, 0px))"
            dndId="home-categories"
            groups={groups}
            editing={editing}
            onChange={saveLayout}
            renderAdd={(sectionId) => (
              <AddCard key={`add-${sectionId ?? "none"}`} label="Add category" onAdd={(name) => startTransition(() => addCategory(name, sectionId))} />
            )}
            after={<AddCard label="Add subcategory" onAdd={(name) => startTransition(() => addHomeSection(name))} />}
            renderSectionHead={(g, handle) => {
              const section = secs.find((s) => s.id === g.id)!;
              return editing ? (
                <div className="flex items-center gap-1 border-b border-line pb-1.5">
                  {handle}
                  <InlineInput
                    value={section.name}
                    label="Subcategory name"
                    onSave={(name) => {
                      setSecs((ss) => ss.map((x) => (x.id === section.id ? { ...x, name } : x)));
                      startTransition(() => renameHomeSection(section.id, name));
                    }}
                    className="flex-1 font-display text-xl font-semibold"
                  />
                  <DeleteButton label={`Delete the ${section.name} subcategory`} onClick={() => removeSection(section)} />
                </div>
              ) : (
                <h2 className="border-b border-line pb-2 font-display text-xl font-semibold text-ink/80">{section.name}</h2>
              );
            }}
            renderItem={(id, handle) => {
              const c = byId.get(id)!;
              return editing ? (
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
              );
            }}
          />
        )}
      </div>
    </>
  );
}
