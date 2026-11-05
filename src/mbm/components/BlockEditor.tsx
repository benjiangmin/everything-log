"use client";

import { useState, useTransition } from "react";
import { deleteBlock, saveBlock } from "@/app/mbm/actions";
import type { Activity, Block } from "@/mbm/data";
import { hhmm, zonedTime } from "@/mbm/time";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import ActivityInput from "./ActivityInput";

const field = "rounded-control border border-line bg-paper px-3 py-2.5 text-ink focus:border-ink";

// Add a missed entry, or change one: what, from, to (or "still going"), a note. Times are on
// this day; an entry that began yesterday (or ends tomorrow) keeps that end unless you change it.
// Entries may overlap others.
export default function BlockEditor({
  dayKey,
  tz,
  activities,
  block,
  from,
  to,
  canRun,
  running = [],
  onDone,
}: {
  dayKey: string;
  tz: string;
  activities: Activity[];
  block?: Block; // editing this one; otherwise adding
  from: number; // start shown
  to: number | null; // end shown (null = still going)
  canRun: boolean; // "still going" is allowed (today)
  running?: string[]; // names of what's running (for "stop it?" when adding one that's still going)
  onDone: () => void;
}) {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const [name, setName] = useState(block?.activity_id ? (byId.get(block.activity_id)?.name ?? "") : "");
  const [start, setStart] = useState(hhmm(new Date(from), tz));
  const [end, setEnd] = useState(() => hhmm(to === null ? new Date() : new Date(to), tz));
  const [going, setGoing] = useState(to === null);
  const [stop, setStop] = useState(true);
  const [note, setNote] = useState(block?.note ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, run] = useTransition();
  const confirm = useConfirm();

  const startedEarlier = block && +new Date(block.started_at) < from;
  const endsLater = block?.ended_at && to !== null && +new Date(block.ended_at) > to;
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
      const m = toMinutes(end); // "00:00" as an end = midnight at the end of this day
      endIso = endsLater && end === endShown ? block!.ended_at : zonedTime(dayKey, m === 0 ? 24 * 60 : m, tz).toISOString();
    }
    run(async () => {
      const res = await saveBlock({ id: block?.id, name, start: startIso, end: endIso, note, stopRunning: !block && going && stop });
      if (res.ok) onDone();
      else setMessage(res.message);
    });
  }

  async function remove() {
    if (!block) return;
    const ok = await confirm({ title: "Delete this entry?", body: "That time goes back to untracked.", confirmLabel: "Delete" });
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
      className={`flex flex-col gap-4 ${pending ? "opacity-70" : ""}`}
    >
      <ActivityInput activities={activities} value={name} onChange={setName} placeholder="What were you doing?" autoFocus={!block} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-sm text-muted">
          From
          <input type="time" required value={start} onChange={(e) => setStart(e.target.value)} className={`${field} num`} style={{ outline: "none" }} />
        </label>
        {!going && (
          <label className="flex items-center gap-2 text-sm text-muted">
            to
            <input type="time" required value={end} onChange={(e) => setEnd(e.target.value)} className={`${field} num`} style={{ outline: "none" }} />
          </label>
        )}
      </div>
      {startedEarlier && start === startShown && <p className="-mt-2 text-xs text-muted">It started the day before (that stays as is unless you change the time).</p>}

      {canRun && (!block || !block.ended_at) && (
        <label className="flex items-center gap-2.5 text-sm text-ink">
          <input type="checkbox" checked={going} onChange={(e) => setGoing(e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
          Still going
        </label>
      )}
      {!block && going && running.length > 0 && (
        <label className="-mt-2 flex items-center gap-2.5 text-sm text-ink">
          <input type="checkbox" checked={stop} onChange={(e) => setStop(e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
          Stop {running.length === 1 ? running[0] : `what's running (${running.join(", ")})`}
        </label>
      )}

      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Note (optional)" aria-label="Note" className={`${field} w-full`} style={{ outline: "none" }} />

      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="h-11 flex-1 rounded-control bg-accent px-4 font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60">
          {pending ? "Saving…" : block ? "Save changes" : "Add"}
        </button>
        {block && (
          <button type="button" onClick={remove} className="h-11 rounded-control px-4 text-sm text-muted transition-colors hover:bg-surface hover:text-danger">
            Delete
          </button>
        )}
      </div>
      {message && <p className="text-sm text-danger">{message}</p>}
    </form>
  );
}
