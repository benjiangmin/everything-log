"use client";

// Undo and redo on the Day page. Before a change (saving, deleting, merging, dragging an edge,
// tucking under), the entries around that day are noted; after it, again. Undo puts the "before"
// back exactly (entries it made are removed, ones it deleted come back); redo puts the "after"
// back. Kept in this browser tab, the last 30 changes.
import { blocksAround, restoreBlocks, type Result } from "@/app/mbm/actions";

type Row = Record<string, unknown> & { id: string };
type Change = { dayKey: string; label: string; before: Row[]; after: Row[] };

let undos: Change[] = [];
let redos: Change[] = [];
let busy = false;
const listeners = new Set<() => void>();
let snapshot = { undo: null as string | null, redo: null as string | null, busy: false };

function emit() {
  snapshot = { undo: undos.at(-1)?.label ?? null, redo: redos.at(-1)?.label ?? null, busy };
  for (const l of listeners) l();
}
export function subscribeUndo(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export const readUndo = () => snapshot;
const SERVER = { undo: null, redo: null, busy: false };
export const readUndoServer = () => SERVER;

// Run a change so it can be undone. (If noting "before" fails, the change still happens: it just
// can't be undone.)
export async function undoable(dayKey: string, label: string, change: () => Promise<Result>): Promise<Result> {
  const before = (await blocksAround(dayKey).catch(() => null)) as Row[] | null;
  const res = await change();
  if (!res.ok || !before) return res;
  const after = (await blocksAround(dayKey).catch(() => null)) as Row[] | null;
  if (!after) return res;
  undos = [...undos.slice(-29), { dayKey, label, before, after }];
  redos = [];
  emit();
  return res;
}

// Make the entries look like `to`, from how they look like `from`: rows in `to` put back as
// they were, rows only in `from` removed.
function put(from: Row[], to: Row[]) {
  const keep = new Set(to.map((r) => r.id));
  const remove = from.filter((r) => !keep.has(r.id)).map((r) => r.id);
  const changed = to.filter((r) => {
    const was = from.find((f) => f.id === r.id);
    return !was || JSON.stringify(was) !== JSON.stringify(r);
  });
  return restoreBlocks(changed, remove);
}

export async function undo(): Promise<Result> {
  const c = undos.at(-1);
  if (!c || busy) return { ok: true };
  busy = true;
  emit();
  const res = await put(c.after, c.before).catch(() => ({ ok: false as const, message: "Couldn't undo. Check your connection." }));
  busy = false;
  if (res.ok) {
    undos = undos.slice(0, -1);
    redos = [...redos, c];
  }
  emit();
  return res;
}

export async function redo(): Promise<Result> {
  const c = redos.at(-1);
  if (!c || busy) return { ok: true };
  busy = true;
  emit();
  const res = await put(c.before, c.after).catch(() => ({ ok: false as const, message: "Couldn't redo. Check your connection." }));
  busy = false;
  if (res.ok) {
    redos = redos.slice(0, -1);
    undos = [...undos, c];
  }
  emit();
  return res;
}
