"use client";

import { useActionState, useEffect, useRef } from "react";
import { addPersonItem, updatePersonItem, type FormState } from "@/app/person/actions";
import type { PersonItem } from "@/lib/person";
import AddBox from "@/components/board/AddBox";

const initial: FormState = { ok: false, message: null };
const field =
  "w-full rounded-control border border-line bg-paper px-3 py-2.5 text-ink placeholder:text-muted/70 focus:border-ink";

// The add box at the top of the page (the thing | +).
// Pass `item` to edit one instead (a small stacked form inside its card).
export default function PersonForm({ item, onDone }: { item?: PersonItem; onDone?: () => void }) {
  const editing = Boolean(item);
  const [state, action, pending] = useActionState(editing ? updatePersonItem : addPersonItem, initial);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!state.ok) return;
    if (editing) return onDone?.();
    if (inputRef.current) inputRef.current.value = "";
    inputRef.current?.focus();
  }, [state.ok, state.savedAt, editing, onDone]);

  const input = (
    <input
      ref={inputRef}
      name="body"
      required
      maxLength={1000}
      defaultValue={item?.body}
      placeholder="Something you look for"
      aria-label="Thing"
      autoFocus={editing}
      style={{ outline: "none" }}
      className={`${field} min-w-0`}
    />
  );

  if (!editing) {
    return (
      <form action={action}>
        <AddBox
          label="Add"
          pending={pending}
          message={state.message}
          rows={input}
        />
      </form>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={item!.id} />
      {input}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div className="ml-auto flex items-center gap-1.5">
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
