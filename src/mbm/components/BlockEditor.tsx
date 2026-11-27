"use client";

import { useState, useTransition } from "react";
import { addStop, deleteBlock, mergeBlocks, saveBlock } from "@/app/mbm/actions";
import { undoable } from "@/mbm/undo";
import type { Activity, Block } from "@/mbm/data";
import { dayKeyOf, hhmm, zonedTime } from "@/mbm/time";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import ActivityInput from "./ActivityInput";
import ColorRow from "./ColorRow";
import EntryPlace from "./EntryPlace";
import NewEntryPlace, { type PlaceChoice } from "./NewEntryPlace";
import { notNextTo } from "@/mbm/nearcheck";
import TimeRange, { type Pick } from "./TimeRange";

// The same job right before or after this entry, offered to merge into one.
export type Merge = { id: string; name: string; color: string; side: "before" | "after"; time: string };

const field = "rounded-control border border-line bg-paper px-3 py-2.5 text-ink focus:border-ink";

// Add a missed entry, or change one: what (its color is the dot in the name box), when, where,
// and a note (behind "+ Note"). Save / Delete stay at the bottom of the panel.
// Times are on this day; an entry that began yesterday (or ends tomorrow) keeps that end unless
// you change it. A running entry has no end here (stop it from the page). Entries may overlap.
export default function BlockEditor({
  dayKey,
  tz,
  activities,
  block,
  from,
  to,
  others = [],
  merges = [],
  onDone,
}: {
  merges?: Merge[]; // the same job right before/after: merge into one
  others?: { name: string; start: number; end: number | null }[]; // the day's other entries (handy times)
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
  const toMinutes = (v: string) => {
    const [h, m] = v.split(":").map(Number);
    return h * 60 + m;
  };
  // Minutes from midnight on this day ("00:00" as an end = midnight at the end of the day).
  const minutesOf = (t: number, isEnd = false) => {
    const m = toMinutes(hhmm(new Date(t), tz));
    return isEnd && m === 0 ? 1440 : m;
  };
  const going = to === null; // a running entry: only its start can change here
  const startShown = minutesOf(from);
  const endShown = to === null ? null : minutesOf(to, true);
  const [start, setStart] = useState(startShown);
  const [end, setEnd] = useState<number | null>(endShown);
  const [nowMin] = useState(() => (dayKeyOf(new Date(), tz) === dayKey ? minutesOf(Date.now()) : null));
  // Handy times: the edges of the day's other entries.
  const picks: Pick[] = others.flatMap((o) => [
    { at: minutesOf(o.start), label: `Start of ${o.name}` },
    ...(o.end !== null ? [{ at: minutesOf(o.end, true), label: `End of ${o.name}` }] : []),
  ]);
  const [note, setNote] = useState(block?.note ?? "");
  const [showNote, setShowNote] = useState(Boolean(block?.note));
  const [place, setPlace] = useState<PlaceChoice>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, run] = useTransition();
  const confirm = useConfirm();
  // The activity typed in, if it already exists: its color can be changed here.
  const known = activities.find((a) => a.name.trim().toLowerCase() === name.trim().toLowerCase());

  const startedEarlier = block && +new Date(block.started_at) < from;
  const endsLater = block?.ended_at && to !== null && +new Date(block.ended_at) > to;

  function save() {
    setMessage(null);
    // (No job but a place: just where you were. The time stays untracked.)
    const placeOnly = !block && !name.trim() && Boolean(place);
    if (!name.trim() && !placeOnly) return setMessage(block ? "What were you doing?" : "What were you doing? (Or just add a place.)");
    if (!going && end !== null && end <= start) return setMessage("The end has to be after the start.");
    // A time you didn't change stays exactly as it was, to the second (the boxes only show
    // minutes): filling in an untracked gap that starts at 11:52:40 starts at 11:52:40, not
    // 11:52, so it doesn't overlap what's before it.
    const startIso =
      start !== startShown ? zonedTime(dayKey, start, tz).toISOString() : startedEarlier ? block!.started_at : new Date(from).toISOString();
    let endIso: string | null = null;
    if (!going && end !== null) {
      endIso =
        end !== endShown ? zonedTime(dayKey, end, tz).toISOString() : endsLater ? block!.ended_at : new Date(to!).toISOString();
    }
    run(async () => {
      // A place for a new entry: only one next to where the phone had you then, if it had you
      // anywhere (an untracked stretch: nothing to go against).
      const p = !block ? place?.place : null;
      if (p) {
        const span = { start: startIso, end: endIso ?? new Date().toISOString() };
        const far = p.kind === "mine" ? await notNextTo({ span }, { placeId: p.id }) : await notNextTo({ span }, { lat: p.lat, lng: p.lng }, place!.name);
        if (far) return setMessage(far);
      }
      if (placeOnly) {
        const res = await addStop({ start: startIso, end: endIso, place: p! });
        if (res.ok) onDone();
        else setMessage(res.message);
        return;
      }
      const res = await undoable(dayKey, block ? `Change ${name.trim()}` : `Add ${name.trim()}`, () =>
        saveBlock({ id: block?.id, name, start: startIso, end: endIso, note: showNote ? note : (block?.note ?? ""), place: p }),
      );
      if (res.ok) onDone();
      else setMessage(res.message);
    });
  }

  async function remove() {
    if (!block) return;
    const ok = await confirm({ title: "Delete this entry?", body: "That time goes back to untracked.", confirmLabel: "Delete" });
    if (!ok) return;
    run(async () => {
      const res = await undoable(dayKey, `Delete ${name.trim() || "the entry"}`, () => deleteBlock(block.id));
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
      className={`flex min-h-full flex-col gap-4 ${pending ? "opacity-70" : ""}`}
    >
      {/* (Above what follows, so the color palette opens on top of the times.) */}
      <div className="relative z-20">
        <ActivityInput
          activities={activities}
          value={name}
          onChange={setName}
          placeholder="What were you doing?"
          autoFocus={!block}
          trailing={
            <div className="flex items-center gap-1.5">
            {known && <ColorRow key={known.id} activity={known} />}
            {known && (
              <a
                href={`/account/jobs#job-${known.id}`}
                title={`${known.name}'s settings: when it stops, its places, goal`}
                aria-label={`${known.name}'s settings`}
                className="grid size-7 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 7h10M18 7h2M4 17h4M12 17h8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                  <circle cx="16" cy="7" r="2.2" stroke="currentColor" strokeWidth="2" />
                  <circle cx="10" cy="17" r="2.2" stroke="currentColor" strokeWidth="2" />
                </svg>
              </a>
            )}
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
            </div>
          }
        />
      </div>
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

      <TimeRange
        start={start}
        end={going ? null : end}
        now={nowMin}
        picks={picks}
        onChange={(s, e) => {
          setStart(s);
          if (!going) setEnd(e);
        }}
      />
      {startedEarlier && start === startShown && <p className="-mt-2 text-xs text-muted">It started the day before (that stays as is unless you change the time).</p>}


      {/* Where it happened (an entry that's already saved). */}
      {block ? <EntryPlace blockId={block.id} /> : <NewEntryPlace value={place} onChange={setPlace} />}


      {/* The same job right before or after: make them one entry. */}
      {block && merges.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {merges.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  setMessage(null);
                  const res = await undoable(dayKey, `Merge ${name.trim()}`, () => mergeBlocks(block.id, m.id));
                  if (res.ok) onDone();
                  else setMessage(res.message);
                })
              }
              className="group flex items-center gap-3.5 rounded-card border border-dashed border-line px-4 py-3 text-left transition-colors hover:border-ink/40 hover:bg-surface disabled:opacity-60"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-muted transition-colors group-hover:bg-paper group-hover:text-ink">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 7h6l4 5-4 5H4M20 12h-6" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-muted">Merge with the one {m.side}</span>
                <span className="mt-0.5 flex items-center gap-2">
                  <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: m.color }} />
                  <span className="truncate font-semibold text-ink">{m.name}</span>
                </span>
                <span className="num mt-0.5 block text-xs text-muted">{m.time}</span>
              </span>
              {/* Two pieces → one. */}
              <span aria-hidden="true" className="flex shrink-0 items-center gap-1.5">
                <span className="flex gap-0.5">
                  <span className="h-3 w-4 rounded-sm" style={{ background: m.color }} />
                  <span className="h-3 w-4 rounded-sm" style={{ background: m.color }} />
                </span>
                <span className="text-xs text-muted">→</span>
                <span className="h-3 w-[2.125rem] rounded-sm" style={{ background: m.color }} />
              </span>
            </button>
          ))}
        </div>
      )}

      {message && <p className="text-sm text-danger">{message}</p>}
      {/* At the bottom of the panel (and stays there if the panel scrolls). */}
      <div className="sticky bottom-0 -mx-5 -mb-5 mt-auto flex items-center gap-2 border-t border-line bg-paper px-5 py-4">
        <button type="submit" disabled={pending} className="h-11 flex-1 rounded-control bg-accent px-4 font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60">
          {pending ? "Saving…" : block ? "Save changes" : !name.trim() && place ? `Add ${place.name}` : "Add"}
        </button>
        {block && (
          <button type="button" onClick={remove} className="h-11 rounded-control px-4 text-sm text-muted transition-colors hover:bg-surface hover:text-danger">
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
