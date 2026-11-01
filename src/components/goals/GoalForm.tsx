"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addGoal, updateGoal, type FormState } from "@/app/goals/actions";
import type { Goal, GoalStatus } from "@/lib/goals";
import SelectPicker from "@/components/ui/SelectPicker";
import OptionalDate from "@/components/games/OptionalDate";
import { GOAL_LABELS, GOAL_ORDER } from "./labels";
import AddBox from "@/components/board/AddBox";
import { localNow } from "@/lib/month";

const initial: FormState = { ok: false, message: null };
const field =
  "w-full rounded-control border border-line bg-paper px-3 py-2.5 text-ink placeholder:text-muted/70 focus:border-ink";

function todayKey() {
  const d = localNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// "Add a goal" (top of the page), also used to edit one inside its card (pass `goal` + compact).
export default function GoalForm({ goal, onDone, compact }: { goal?: Goal; onDone?: () => void; compact?: boolean }) {
  const editing = Boolean(goal);
  const [state, action, pending] = useActionState(editing ? updateGoal : addGoal, initial);
  const [status, setStatus] = useState<GoalStatus>(goal?.status ?? "backlog");
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!state.ok) return;
    if (editing) return onDone?.();
    const form = formRef.current;
    for (const name of ["title", "why", "proof"]) {
      const el = form?.elements.namedItem(name) as HTMLInputElement | null;
      if (el) el.value = "";
    }
    titleRef.current?.focus();
  }, [state.ok, state.savedAt, editing, onDone]);

  const title = (
    <input
      ref={titleRef}
      name="title"
      required
      maxLength={200}
      defaultValue={goal?.title}
      placeholder="Goal"
      aria-label="Goal"
      style={{ outline: "none" }}
      className={`${field} min-w-0 flex-1`}
    />
  );
  const picker = (
    <div className={compact ? "" : "w-36 shrink-0 sm:w-44"}>
      <SelectPicker<GoalStatus>
        label="Status"
        value={status}
        options={GOAL_ORDER.map((s) => ({ value: s, label: GOAL_LABELS[s] }))}
        onChange={setStatus}
      />
    </div>
  );
  const why = (
    <input
      name="why"
      maxLength={500}
      defaultValue={goal?.why ?? ""}
      placeholder="Why (optional)"
      aria-label="Why"
      style={{ outline: "none" }}
      className={`${field} min-w-0`}
    />
  );
  const proof = (
    <input
      name="proof"
      maxLength={500}
      defaultValue={goal?.proof ?? ""}
      placeholder="Proof link (optional)"
      aria-label="Proof"
      style={{ outline: "none" }}
      className={`${field} min-w-0`}
    />
  );

  // The add box at the top of the page: dates on the left | goal + status, why | + button.
  if (!compact) {
    return (
      <form ref={formRef} action={action}>
        <input type="hidden" name="status" value={status} />
        <AddBox
          label="Add goal"
          pending={pending}
          message={state.message}
          // Keyed on the last save, so the dates reset after adding. A new goal starts today.
          side={
            <div key={state.savedAt ?? 0} className="contents">
              <OptionalDate name="started_on" label="Start" defaultValue={todayKey()} block />
              <OptionalDate name="finished_on" label="Completed" defaultValue={null} block />
            </div>
          }
          rows={
            <>
              {/* No status picker when adding: New goals start in Yet to start (drag it on the board to change). */}
              <div className="flex">{title}</div>
              {/* No proof box here: proof comes later, by editing the goal once it's done. */}
              {why}
            </>
          }
        />
      </form>
    );
  }

  // Editing inside a card: everything stacked.
  return (
    <form ref={formRef} action={action} className="flex flex-col gap-2">
      {goal && <input type="hidden" name="id" value={goal.id} />}
      <input type="hidden" name="status" value={status} />
      {title}
      {picker}
      {why}
      {proof}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <OptionalDate name="started_on" label="Start" defaultValue={goal?.started_on ?? null} />
        <span className="text-muted/60" aria-hidden="true">→</span>
        <OptionalDate name="finished_on" label="Completed" defaultValue={goal?.finished_on ?? null} />
        <div className="flex w-full items-center justify-end gap-1.5">
          {state.message && (
            <p role="status" className="text-sm text-danger">
              {state.message}
            </p>
          )}
          <button
            type="button"
            onClick={onDone}
            className="rounded-control px-3 py-2.5 text-sm text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-control bg-accent px-5 py-2.5 font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </form>
  );
}
