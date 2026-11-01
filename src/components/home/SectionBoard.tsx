"use client";

import { useState, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// A category's pages, split into sections (subcategories). Pages with no section come first; each
// section is a heading with its pages under it. While editing, everything drags: pages within and
// between sections (including into empty ones), and whole sections by the handle on their heading.

export type Group = { id: string | null; name: string; itemIds: string[] }; // id null = no section

const NONE = "none"; // the "no section" group's key
const groupKey = (id: string | null) => id ?? NONE;
const SEC = "sec:"; // section drag ids
const DROP = "drop:"; // section-body drop zones

export default function SectionBoard({
  dndId,
  groups,
  editing,
  onChange,
  renderItem,
  renderSectionHead,
  renderAdd,
  after,
}: {
  dndId: string;
  groups: Group[]; // first one is "no section"
  editing: boolean;
  onChange: (next: Group[]) => void; // after a drag (save it)
  renderItem: (id: string, handle: ReactNode) => ReactNode;
  renderSectionHead: (group: Group, handle: ReactNode) => ReactNode;
  renderAdd: (sectionId: string | null) => ReactNode; // "+ Add page" at the end of a group (editing)
  after?: ReactNode; // "+ Add subcategory"
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [live, setLive] = useState<Group[] | null>(null); // the layout while a page is being dragged
  const shown = live ?? groups;

  const groupOf = (layout: Group[], itemId: string) => layout.find((g) => g.itemIds.includes(itemId));

  // Sections only collide with sections; pages with pages and section bodies.
  const collide: CollisionDetection = (args) => {
    const isSection = String(args.active.id).startsWith(SEC);
    const containers = args.droppableContainers.filter((c) => String(c.id).startsWith(SEC) === isSection);
    if (isSection) return closestCenter({ ...args, droppableContainers: containers });
    const hits = pointerWithin({ ...args, droppableContainers: containers });
    const pages = hits.filter((h) => !String(h.id).startsWith(DROP));
    return pages.length ? pages : hits.length ? hits : closestCenter({ ...args, droppableContainers: containers });
  };

  // A page dragged over another group moves into it right away (so the grids make room).
  function onDragOver({ active, over }: DragOverEvent) {
    const id = String(active.id);
    if (!over || id.startsWith(SEC)) return;
    const layout = live ?? groups;
    const from = groupOf(layout, id);
    const overId = String(over.id);
    const to = overId.startsWith(DROP) ? layout.find((g) => groupKey(g.id) === overId.slice(DROP.length)) : groupOf(layout, overId);
    if (!from || !to || from === to) return;
    const at = overId.startsWith(DROP) ? to.itemIds.length : to.itemIds.indexOf(overId);
    setLive(
      layout.map((g) =>
        g === from
          ? { ...g, itemIds: g.itemIds.filter((x) => x !== id) }
          : g === to
            ? { ...g, itemIds: [...g.itemIds.slice(0, at), id, ...g.itemIds.slice(at)] }
            : g,
      ),
    );
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const layout = live ?? groups;
    setLive(null);
    const id = String(active.id);
    if (id.startsWith(SEC)) {
      // A whole section moved (the "no section" group always stays first).
      if (!over || over.id === active.id) return;
      const sections = layout.slice(1);
      const from = sections.findIndex((g) => SEC + g.id === id);
      const to = sections.findIndex((g) => SEC + g.id === String(over.id));
      if (from < 0 || to < 0) return;
      onChange([layout[0], ...arrayMove(sections, from, to)]);
      return;
    }
    // A page: reorder inside its (maybe new) group.
    const g = groupOf(layout, id);
    let next = layout;
    if (g && over && !String(over.id).startsWith(DROP) && g.itemIds.includes(String(over.id))) {
      const from = g.itemIds.indexOf(id);
      const to = g.itemIds.indexOf(String(over.id));
      if (from !== to) next = layout.map((x) => (x === g ? { ...x, itemIds: arrayMove(x.itemIds, from, to) } : x));
    }
    if (next !== groups) onChange(next);
  }

  const [none, ...sections] = shown;

  return (
    <DndContext id={dndId} sensors={sensors} collisionDetection={collide} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => setLive(null)}>
      {/* No section: always first, no heading. */}
      {(none.itemIds.length > 0 || editing) && (
        <GroupGrid group={none} editing={editing} renderItem={renderItem} renderAdd={renderAdd} />
      )}

      <SortableContext items={sections.map((s) => SEC + s.id)} strategy={verticalListSortingStrategy} disabled={!editing}>
        {sections.map((s) =>
          // Empty sections only show while editing.
          s.itemIds.length > 0 || editing ? (
            <SectionBlock key={s.id} group={s} editing={editing} renderItem={renderItem} renderHead={renderSectionHead} renderAdd={renderAdd} />
          ) : null,
        )}
      </SortableContext>

      {editing && after && <div className="mt-10 grid">{after}</div>}
    </DndContext>
  );
}

function SectionBlock({
  group,
  editing,
  renderItem,
  renderHead,
  renderAdd,
}: {
  group: Group;
  editing: boolean;
  renderItem: (id: string, handle: ReactNode) => ReactNode;
  renderHead: (group: Group, handle: ReactNode) => ReactNode;
  renderAdd: (sectionId: string | null) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: SEC + group.id,
    disabled: !editing,
  });
  return (
    // The space above each section is what sets it apart (mt-10).
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`mt-10 ${isDragging ? "relative z-20 rounded-card bg-paper/90 shadow-xl shadow-ink/20 ring-1 ring-line" : ""}`}
    >
      {renderHead(group, editing ? <Handle refFn={setActivatorNodeRef} props={{ ...attributes, ...listeners }} label={`Drag ${group.name}`} /> : null)}
      <GroupGrid group={group} editing={editing} renderItem={renderItem} renderAdd={renderAdd} />
    </section>
  );
}

// A group's pages in a 2-column grid. Also a drop zone, so a page can land in an empty group.
function GroupGrid({
  group,
  editing,
  renderItem,
  renderAdd,
}: {
  group: Group;
  editing: boolean;
  renderItem: (id: string, handle: ReactNode) => ReactNode;
  renderAdd: (sectionId: string | null) => ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: DROP + groupKey(group.id), disabled: !editing });
  return (
    <SortableContext items={group.itemIds} strategy={rectSortingStrategy} disabled={!editing}>
      <div
        ref={setNodeRef}
        className={`grid gap-3 rounded-card transition-colors sm:grid-cols-2 ${group.id !== null ? "mt-3" : ""} ${
          editing && isOver && group.itemIds.length === 0 ? "bg-accent/5" : ""
        }`}
      >
        {group.itemIds.map((id) => (
          <PageCell key={id} id={id} editing={editing} renderItem={renderItem} />
        ))}
        {editing && renderAdd(group.id)}
      </div>
    </SortableContext>
  );
}

function PageCell({ id, editing, renderItem }: { id: string; editing: boolean; renderItem: (id: string, handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !editing });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? "relative z-10 rounded-card shadow-xl shadow-ink/20" : undefined}
    >
      {renderItem(id, editing ? <Handle refFn={setActivatorNodeRef} props={{ ...attributes, ...listeners }} label="Drag to move" /> : null)}
    </div>
  );
}

// The ⠿ drag handle.
function Handle({ refFn, props, label }: { refFn: (el: HTMLElement | null) => void; props: object; label: string }) {
  return (
    <button
      type="button"
      ref={refFn}
      {...props}
      aria-label={label}
      className="grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-control text-muted transition-colors hover:bg-paper hover:text-ink active:cursor-grabbing"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        {[6, 12, 18].map((y) => (
          <g key={y}>
            <circle cx="9" cy={y} r="1.7" />
            <circle cx="15" cy={y} r="1.7" />
          </g>
        ))}
      </svg>
    </button>
  );
}
