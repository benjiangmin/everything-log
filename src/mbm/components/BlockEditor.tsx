"use client";

import { useState, useTransition } from "react";
import { deleteBlock, saveBlock } from "@/app/mbm/actions";
import type { Activity, Block } from "@/mbm/data";
import { hhmm, zonedTime } from "@/mbm/time";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import ActivityInput from "./ActivityInput";

const field = "rounded-control border border-line bg-paper px-3 py-2.5 text-ink focus:border-ink";

// Add or change one block: what, from, to (or "still going"), a note. Times are on this day;
// a block that started yesterday (or ends tomorrow) keeps that end unless you change the time.
export default function BlockEditor({
  dayKey,
  tz,
  activities,
  block,
  from,
  to,
  onDone,
}: {
  dayKey: string;
  tz: string;
  activities: Activity[];
  block?: Block; // editing this one; otherwise adding
  from: number; // start shown (the block's, trimmed to the day, or the gap's)
  to: number | null; // null = still going
  onDone: () => void;
}) {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const [name, setName] = useState(block?.activity_id ? (byId.get(block.activity_id)?.name ?? "") : "");
  const [start, setStart] = useState(hhmm(new Date(from), tz));
  const [end, setEnd] = useState(to === null ? "" : hhmm(new Date(to), tz));
  const [going, setGoing] = useState(to === null);
  const [note, setNote] = useState(block?.note ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, run] = useTransition();
  const confirm = useConfirm();

  const startedEarlier = block && +new Date(block.started_at) < from; // began on an earlier day
  const endsLater = block?.ended_at && to !== null && +new Date(block.ended_at) > to; // runs into tomorrow
  const startShown = hhmm(new Date(from), tz);
  const endShown = to === null ? "" : hhmm(new Date(to), tz);

  const toMinutes = (v: string) => {
    const [h, m] = v.split(":").map(Number);
    return h * 60 + m;
  };

  function save() {
    setMessage(null);
    if (!name.trim()) return setMessage("What were you doing?");
    if (!start || (!going && !end)) return setMessage("Pick the times.");
    const startIso = startedEarlier && start === startShown ? block!.started_at : zonedTime(dayKey, toMinutes(start), tz).toISOString();
    let endIso: string | null = null;
    if (!going) {
      // "00:00" as an end = midnight at the end of this day.
      const m = toMinutes(end);
      endIso = endsLater && end === endShown ? block!.ended_at : m === 0 ? zonedTime(dayKey, 24 * 60, tz).toISOString() : zonedTime(dayKey, m, tz).toISOString();
    }
    run(async () => {
      const res = await saveBlock({ id: block?.id, name, start: startIso, end: endIso, note });
      if (res.ok) onDone();
      else setMessage(res.message);
    });
  }

  async function remove() {
    if (!block) return;
    const ok = await confirm({ title: "Delete this block?", body: "That time goes back to untracked.", confirmLabel: "Delete" });
    if (!ok) return;
    run(async () => {
      const res = await deleteBlock(block.id);
      if (res.ok) onDone();
      else setMessage(res.message);
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className={`flex flex-col gap-3 rounded-card bg-surface p-3 ring-1 ring-line sm:p-4 ${pending ? "opacity-70" : ""}`}
    >
      <ActivityInput activities={activities} value={name} onChange={setName} placeholder="What were you doing?" autoFocus={!block} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-muted">
          From
          <input type="time" required value={start} onChange={(e) => setStart(e.target.value)} className={`${field} num`} style={{ outline: "none" }} />
          {startedEarlier && start === startShown && <span className="text-xs">(started earlier)</span>}
        </label>
        {!going && (
          <label className="flex items-center gap-2 text-sm text-muted">
            to
            <input type="time" required value={end} onChange={(e) => setEnd(e.target.value)} className={`${field} num`} style={{ outline: "none" }} />
          </label>
        )}
        {block && !block.ended_at && (
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={going} onChange={(e) => setGoing(e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
            Still going
          </label>
        )}
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        placeholder="Note (optional)"
        aria-label="Note"
        className={`${field} w-full`}
        style={{ outline: "none" }}
      />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="rounded-control bg-accent px-4 py-2 font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onDone} className="rounded-control px-3 py-2 text-sm text-muted transition-colors hover:bg-paper hover:text-ink">
          Cancel
        </button>
        {block && (
          <button type="button" onClick={remove} className="ml-auto rounded-control px-3 py-2 text-sm text-muted transition-colors hover:bg-paper hover:text-danger">
            Delete
          </button>
        )}
      </div>
      {message && <p className="text-sm text-danger">{message}</p>}
    </form>
  );
}
