"use client";

import { useState, useTransition } from "react";
import { deleteBlock, saveBlock } from "@/app/mbm/actions";
import type { Activity, Block } from "@/mbm/data";
import { hhmm, zonedTime } from "@/mbm/time";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import ActivityInput from "./ActivityInput";
import ColorRow from "./ColorRow";

const field = "rounded-control border border-line bg-paper px-3 py-2.5 text-ink focus:border-ink";

// Add a missed entry, or change one: what, from, to, and a note (behind "+ Note" in the name box).
// Times are on this day; an entry that began yesterday (or ends tomorrow) keeps that end unless
// you change it. A running entry has no end here (stop it from the page). Entries may overlap.
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
  from: number; // start shown
  to: number | null; // end shown (null = it's running)
  onDone: () => void;
}) {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const [name, setName] = useState(block?.activity_id ? (byId.get(block.activity_id)?.name ?? "") : "");
  const [start, setStart] = useState(hhmm(new Date(from), tz));
  const [end, setEnd] = useState(() => hhmm(to === null ? new Date() : new Date(to), tz));
  const going = to === null; // a running entry: only its start can change here
  const [note, setNote] = useState(block?.note ?? "");
  const [showNote, setShowNote] = useState(Boolean(block?.note));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, run] = useTransition();
  const confirm = useConfirm();
  // The activity typed in, if it already exists: its color can be changed here.
  const known = activities.find((a) => a.name.trim().toLowerCase() === name.trim().toLowerCase());

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
      const res = await saveBlock({ id: block?.id, name, start: startIso, end: endIso, note: showNote ? note : (block?.note ?? "") });
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
      <ActivityInput
        activities={activities}
        value={name}
        onChange={setName}
        placeholder="What were you doing?"
        autoFocus={!block}
        trailing={
          <button
            type="button"
            onClick={() => setShowNote((v) => !v)}
            aria-expanded={showNote}
            className={`rounded-[9px] border px-2.5 py-1.5 text-xs font-semibold leading-none transition-colors ${
              showNote ? "border-accent/30 bg-accent/10 text-accent" : "border-dashed border-muted/50 text-muted hover:border-muted hover:text-ink"
            }`}
          >
            {showNote ? "− Note" : "+ Note"}
          </button>
        }
      />
      {/* The note, under a line, once "+ Note" is clicked. Folding it away keeps a saved note. */}
      {showNote && (
        <div className="-mt-1 border-t border-accent/20 pt-3">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            autoFocus={!block?.note}
            placeholder="Note"
            aria-label="Note"
            className={`${field} w-full`}
            style={{ outline: "none" }}
          />
        </div>
      )}

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

      {going && <p className="-mt-2 text-xs text-muted">Still running (stop it from the page).</p>}

      {known && <ColorRow key={known.id} activity={known} />}

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
