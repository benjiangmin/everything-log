"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  addItem,
  addSection,
  deleteItem,
  deleteSection,
  moveItem,
  renameSection,
  saveCategoryLayout,
  setCategoryDescription,
  updateItem,
} from "@/app/home-actions";
import { createJournalDoc } from "@/app/journal/actions";
import { createTrip } from "@/app/trips/actions";
import { createFocusRecord } from "@/app/focus/actions";
import type { HomeItem, HomeSection } from "@/lib/home";
import {
  BIBLE_LABEL,
  JOURNAL_LABEL,
  PAGES,
  FOCUS_LABEL,
  TRIP_LABEL,
  bibleHref,
  bibleYear,
  journalHref,
  journalYear,
  tripHref,
  tripId,
  focusHref,
  focusId,
} from "@/lib/home-pages";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import SelectPicker from "@/components/ui/SelectPicker";
import SectionBoard, { type Group } from "./SectionBoard";
import { AddCard, DeleteButton, Empty, InlineInput, PageHeader, useLocalCopy } from "./bits";
import { localNow } from "@/lib/month";

type Cat = { id: string; name: string };

// A category's page: a description under the title, then one card per page, split into sections
// (subcategories) like "Breaks" or "California". Built pages are solid cards you can click; ones that
// don't open anything yet are dashed. "Edit" turns on the description, dragging (pages and whole
// sections), renaming, adding and moving.
export default function ItemGrid({
  category,
  sections,
  items,
  all,
}: {
  category: Cat & { description: string | null };
  sections: HomeSection[];
  items: HomeItem[];
  all: Cat[];
}) {
  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useLocalCopy(items);
  const [secs, setSecs] = useLocalCopy(sections);
  const [description, setDescription] = useLocalCopy(category.description);
  const [, startTransition] = useTransition();
  const confirm = useConfirm();

  const byId = new Map(order.map((i) => [i.id, i]));
  // "No section" first, then each section, each with its pages in order.
  const groups: Group[] = [
    { id: null, name: "", itemIds: order.filter((i) => !i.section_id || !secs.some((s) => s.id === i.section_id)).map((i) => i.id) },
    ...secs.map((s) => ({ id: s.id, name: s.name, itemIds: order.filter((i) => i.section_id === s.id).map((i) => i.id) })),
  ];

  const patch = (id: string, changes: Partial<HomeItem>) =>
    setOrder((o) => o.map((x) => (x.id === id ? { ...x, ...changes } : x)));

  // After a drag: rebuild the local order from the groups, then save the whole layout.
  function saveLayout(next: Group[]) {
    const flat = next.flatMap((g) => g.itemIds.map((id) => ({ ...byId.get(id)!, section_id: g.id })));
    const nextSecs = next.slice(1).map((g) => secs.find((s) => s.id === g.id)!);
    setOrder(flat);
    setSecs(nextSecs);
    startTransition(() =>
      saveCategoryLayout(
        nextSecs.map((s) => s.id),
        flat.map((i) => ({ id: i.id, section_id: i.section_id })),
      ),
    );
  }

  async function remove(item: HomeItem) {
    const ok = await confirm({
      title: `Delete "${item.name}"?`,
      body: item.href ? "This only removes the card. The page and its data stay." : undefined,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setOrder((o) => o.filter((x) => x.id !== item.id));
    startTransition(() => deleteItem(item.id));
  }

  async function removeSection(section: HomeSection) {
    const count = order.filter((i) => i.section_id === section.id).length;
    const ok = await confirm({
      title: `Delete the "${section.name}" subcategory?`,
      body: count ? `Its ${count} ${count === 1 ? "page moves" : "pages move"} back to the top (nothing else is deleted).` : undefined,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setSecs((ss) => ss.filter((x) => x.id !== section.id));
    setOrder((o) => o.map((i) => (i.section_id === section.id ? { ...i, section_id: null } : i)));
    startTransition(() => deleteSection(section.id));
  }

  return (
    <>
      <PageHeader
        title={category.name}
        back={{ href: "/", label: "Home" }}
        editing={editing}
        onToggle={() => setEditing((e) => !e)}
        description={description}
        onDescription={(d) => {
          setDescription(d || null);
          startTransition(() => setCategoryDescription(category.id, d));
        }}
      />

      <div className="mt-8">
        {order.length === 0 && secs.length === 0 && !editing ? (
          <Empty>Nothing in {category.name} yet. Press Edit to add something.</Empty>
        ) : (
          <SectionBoard
            dndId={`items-${category.id}`}
            groups={groups}
            editing={editing}
            onChange={saveLayout}
            renderAdd={(sectionId) => (
              <AddCard key={`add-${sectionId ?? "none"}`} label="Add page" onAdd={(name) => startTransition(() => addItem(category.id, name, sectionId))} />
            )}
            after={<AddCard label="Add subcategory" onAdd={(name) => startTransition(() => addSection(category.id, name))} />}
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
                      startTransition(() => renameSection(section.id, name));
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
              const item = byId.get(id)!;
              return editing ? (
                <div className="rounded-card bg-surface py-3 pl-2 pr-2">
                  <div className="flex items-center gap-1">
                    {handle}
                    <InlineInput
                      value={item.name}
                      label="Name"
                      onSave={(name) => {
                        patch(item.id, { name });
                        startTransition(() => updateItem(item.id, { name }));
                      }}
                      className="flex-1 font-display text-lg font-semibold"
                    />
                    <DeleteButton label={`Delete ${item.name}`} onClick={() => remove(item)} />
                  </div>
                  <div className="pl-9 pr-2">
                    <InlineInput
                      value={item.blurb ?? ""}
                      label="Description"
                      placeholder="Add a short description"
                      allowEmpty
                      onSave={(blurb) => {
                        patch(item.id, { blurb: blurb || null });
                        startTransition(() => updateItem(item.id, { blurb }));
                      }}
                      className="w-full text-sm text-muted placeholder:text-muted/60"
                    />
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted">
                      <OpensPicker
                        href={item.href}
                        onChange={(href) => {
                          patch(item.id, { href });
                          startTransition(() => updateItem(item.id, { href }));
                        }}
                      />
                      <div className="flex flex-col gap-1">
                        In category
                        <SelectPicker
                          label="In category"
                          value={category.id}
                          options={all.map((c) => ({ value: c.id, label: c.name }))}
                          onChange={(to) => {
                            setOrder((o) => o.filter((x) => x.id !== item.id)); // it leaves this page
                            startTransition(() => moveItem(item.id, to));
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : item.href ? (
                <Link href={item.href} className="block min-h-20 rounded-card bg-surface p-5 transition-colors hover:bg-line/70">
                  <p className="font-display text-lg font-semibold">{item.name}</p>
                  {item.blurb && <p className="mt-1 text-sm text-muted">{item.blurb}</p>}
                </Link>
              ) : (
                <div aria-disabled="true" className="min-h-20 rounded-card border border-dashed border-line p-5">
                  <p className="font-display text-lg font-semibold text-muted">{item.name}</p>
                  <p className="mt-1 text-sm text-muted">Coming soon</p>
                </div>
              );
            }}
          />
        )}
      </div>
    </>
  );
}

const selectClass =
  "w-full rounded-control border border-line bg-paper px-2 py-1.5 text-sm text-ink hover:border-muted";

// The "Opens" dropdown. Picking "Unsuspicious document…" asks which year, then links to that year's page.
// Picking "Recreational record…" makes a new, empty trip page and links to it.
// Picking "Bible in a year…" asks which year, then links to that year's page.
const ASK_YEAR = "__journal";
const NEW_TRIP = "__trip";
const NEW_FOCUS = "__focus"; // "Unrecreational record… (new)" makes a new, empty record
const ASK_BIBLE = "__bible";

function OpensPicker({ href, onChange }: { href: string | null; onChange: (href: string | null) => void }) {
  const [askingYear, setAskingYear] = useState(false);
  const [askingBible, setAskingBible] = useState(false);
  const [kind, setKind] = useState<1 | 9>(9); // 1 = calendar year, 9 = school year (Sep–Aug)
  const [saving, setSaving] = useState(false);
  const year = journalYear(href);
  const trip = tripId(href);
  const focus = focusId(href);
  const bible = bibleYear(href);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-col gap-1">
        Opens
        <SelectPicker<string>
          label="Opens"
          value={askingYear ? ASK_YEAR : askingBible ? ASK_BIBLE : (href ?? "")}
          options={[
            { value: "", label: "Not built yet" },
            ...PAGES.map((p) => ({ value: p.href as string, label: p.label })),
            ...(year !== null ? [{ value: href!, label: `${JOURNAL_LABEL} · ${year}` }] : []),
            { value: ASK_YEAR, label: `${JOURNAL_LABEL}…` },
            ...(trip !== null ? [{ value: href!, label: TRIP_LABEL }] : []),
            { value: NEW_TRIP, label: saving ? "Making…" : `${TRIP_LABEL}… (new)` },
            ...(focus !== null ? [{ value: href!, label: FOCUS_LABEL }] : []),
            { value: NEW_FOCUS, label: saving ? "Making…" : `${FOCUS_LABEL}… (new)` },
            ...(bible !== null ? [{ value: href!, label: `${BIBLE_LABEL} · ${bible}` }] : []),
            { value: ASK_BIBLE, label: `${BIBLE_LABEL}…` },
          ]}
          onChange={async (v) => {
            setAskingBible(v === ASK_BIBLE);
            if (v === ASK_BIBLE) return setAskingYear(false);
            if (v === ASK_YEAR) return setAskingYear(true);
            if (v === NEW_FOCUS) {
              setAskingYear(false);
              setSaving(true);
              const id = await createFocusRecord();
              setSaving(false);
              return onChange(focusHref(id));
            }
            if (v === NEW_TRIP) {
              setAskingYear(false);
              setSaving(true);
              const id = await createTrip();
              setSaving(false);
              return onChange(tripHref(id));
            }
            setAskingYear(false);
            onChange(v || null);
          }}
        />
      </div>

      {/* New document: pick the year and whether it's a calendar or school year (set once). */}
      {askingYear && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const y = Number(new FormData(e.currentTarget).get("year"));
            if (!Number.isInteger(y) || y < 1900 || y > 2100) return;
            setSaving(true);
            await createJournalDoc(y, kind);
            setSaving(false);
            onChange(journalHref(y));
            setAskingYear(false);
          }}
          className="mt-1 flex flex-col gap-1.5 rounded-control bg-paper/70 p-2"
        >
          <input
            name="year"
            type="number"
            inputMode="numeric"
            autoFocus
            required
            min={1900}
            max={2100}
            defaultValue={year ?? localNow().getFullYear()}
            aria-label="Which year does it start in?"
            style={{ outline: "none" }}
            className={`no-spin ${selectClass} focus:border-ink`}
          />
          <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Year type">
            {([
              [1, "Calendar"],
              [9, "School"],
            ] as const).map(([value, text]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={kind === value}
                onClick={() => setKind(value)}
                title={value === 1 ? "Jan 1 – Dec 31" : "Sep 1 – Aug 31"}
                className={`rounded-control py-1.5 text-xs font-semibold transition-colors ${
                  kind === value ? "bg-accent text-accent-ink" : "bg-surface text-muted hover:text-ink"
                }`}
              >
                {text}
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-control bg-accent py-1.5 text-sm font-semibold text-accent-ink hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Setting up…" : "Set"}
          </button>
          <p className="text-[11px] leading-snug text-muted">The year type can&apos;t be changed later.</p>
        </form>
      )}

      {/* Bible in a year: just pick the year (always Jan–Dec). */}
      {askingBible && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const y = Number(new FormData(e.currentTarget).get("year"));
            if (!Number.isInteger(y) || y < 1900 || y > 2100) return;
            onChange(bibleHref(y));
            setAskingBible(false);
          }}
          className="mt-1 flex flex-col gap-1.5 rounded-control bg-paper/70 p-2"
        >
          <input
            name="year"
            type="number"
            inputMode="numeric"
            autoFocus
            required
            min={1900}
            max={2100}
            defaultValue={bible ?? localNow().getFullYear()}
            aria-label="Which year?"
            style={{ outline: "none" }}
            className={`no-spin ${selectClass} focus:border-ink`}
          />
          <button type="submit" className="rounded-control bg-accent py-1.5 text-sm font-semibold text-accent-ink hover:opacity-90">
            Set
          </button>
        </form>
      )}
    </div>
  );
}
