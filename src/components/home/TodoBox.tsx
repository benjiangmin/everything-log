"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { addTodo, deleteTodo, editTodo, setTodoDone } from "@/app/todo-actions";
import { EDGE_SHADOW, useUnderBarShadow } from "./sticky";

// The home page's todo list, under Minute by Minute. Sticks under the Home bar as you scroll.
//   - Type in the last line and press Enter to add one (Enter in a todo adds one after it).
//   - ⌘B / ⌘I / ⌘U for bold, italic, underline (no menu).
//   - Check one off: it greys out, gets struck through, and moves to the bottom. Checked ones are
//     deleted at the end of the day; unchecked ones stay.
//   - Empty a todo (Backspace) to delete it.

export type TodoItem = { id: string; html: string; done: boolean; done_at: string | null; position: number };

const sorted = (list: TodoItem[]) =>
  [...list].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.done) return (a.done_at ?? "").localeCompare(b.done_at ?? "");
    return a.position - b.position;
  });
const isEmpty = (html: string) => !html.replace(/<br\s*\/?>/gi, "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();

export default function TodoBox({ initial }: { initial: TodoItem[] | "missing" }) {
  const box = useRef<HTMLDivElement>(null);
  const shadow = useUnderBarShadow(box);
  const [items, setItems] = useState<TodoItem[]>(initial === "missing" ? [] : sorted(initial));
  const [focusId, setFocusId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const save = (fn: () => Promise<void>) =>
    start(async () => {
      try {
        await fn();
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    });

  const open = items.filter((t) => !t.done);
  const lastPos = open.length ? open[open.length - 1].position : 0;

  // A new todo after `after` (or at the end), focused.
  function add(html: string, after?: TodoItem) {
    const i = after ? open.findIndex((t) => t.id === after.id) : -1;
    const next = i >= 0 ? open[i + 1] : undefined;
    const position = after ? (next ? (after.position + next.position) / 2 : after.position + 1) : lastPos + 1;
    const todo: TodoItem = { id: crypto.randomUUID(), html, done: false, done_at: null, position };
    setItems((list) => sorted([...list, todo]));
    if (after) setFocusId(todo.id);
    save(() => addTodo(todo.id, html, position));
    return todo;
  }

  function edit(todo: TodoItem, html: string) {
    if (html === todo.html) return;
    if (isEmpty(html)) return remove(todo);
    setItems((list) => list.map((t) => (t.id === todo.id ? { ...t, html } : t)));
    save(() => editTodo(todo.id, html));
  }

  function remove(todo: TodoItem, focusPrev = false) {
    if (focusPrev) {
      const i = open.findIndex((t) => t.id === todo.id);
      setFocusId(i > 0 ? open[i - 1].id : "new");
    }
    setItems((list) => list.filter((t) => t.id !== todo.id));
    save(() => deleteTodo(todo.id));
  }

  function toggle(todo: TodoItem) {
    const done = !todo.done;
    setItems((list) => sorted(list.map((t) => (t.id === todo.id ? { ...t, done, done_at: done ? new Date().toISOString() : null } : t))));
    save(() => setTodoDone(todo.id, done));
  }

  return (
    <div ref={box} data-under-bar className={`sticky z-30 -mx-3 mt-3 bg-paper px-3 pb-3 pt-3 transition-shadow ${shadow ? EDGE_SHADOW : ""}`} style={{ top: "var(--home-bar-h, 0px)" }}>
      <section aria-label="Todo" className="rounded-card border-2 border-ink px-4 py-3 sm:px-5">
        <h2 className="mb-1.5 font-display text-lg font-semibold">Todo</h2>
        {initial === "missing" ? (
          <p className="text-sm text-muted">
            Run <code>supabase/todos.sql</code> in Supabase to turn this on.
          </p>
        ) : (
          <ul className="max-h-[40vh] overflow-y-auto">
            {open.map((t) => (
              <Row
                key={t.id}
                todo={t}
                focus={focusId === t.id}
                onFocused={() => setFocusId(null)}
                onToggle={() => toggle(t)}
                onSave={(html) => edit(t, html)}
                onEnter={(html) => {
                  edit(t, html);
                  add("", t);
                }}
                onEmptyBackspace={() => remove(t, true)}
              />
            ))}
            <NewRow focus={focusId === "new"} onFocused={() => setFocusId(null)} onAdd={(html) => add(html)} />
            {items
              .filter((t) => t.done)
              .map((t) => (
                <Row key={t.id} todo={t} onToggle={() => toggle(t)} onSave={(html) => edit(t, html)} />
              ))}
          </ul>
        )}
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </section>
    </div>
  );
}

function Check({ done, onClick, label }: { done: boolean; onClick?: () => void; label: string }) {
  return (
    <input
      type="checkbox"
      checked={done}
      onChange={onClick}
      disabled={!onClick}
      aria-label={label}
      className="mt-[3px] size-4 shrink-0 cursor-pointer accent-[var(--ink)] disabled:cursor-default disabled:opacity-40"
    />
  );
}

// The editable text. Its HTML is set by hand (not by React) so typing doesn't jump the cursor.
function Text({
  html,
  done = false,
  placeholder,
  focus,
  onFocused,
  onBlur,
  onEnter,
  onEmptyBackspace,
  label,
}: {
  html: string;
  done?: boolean;
  placeholder?: string;
  focus?: boolean;
  onFocused?: () => void;
  onBlur: (html: string) => void;
  onEnter?: (html: string) => void;
  onEmptyBackspace?: () => void;
  label: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (el.current && document.activeElement !== el.current && el.current.innerHTML !== html) el.current.innerHTML = html;
  }, [html]);
  useEffect(() => {
    if (!focus || !el.current) return;
    el.current.focus();
    const range = document.createRange();
    range.selectNodeContents(el.current);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    onFocused?.();
  }, [focus, onFocused]);
  return (
    <div
      ref={el}
      role="textbox"
      aria-label={label}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onBlur={(e) => onBlur(e.currentTarget.innerHTML)}
      onPaste={(e) => {
        // Plain text only.
        e.preventDefault();
        document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
      }}
      onKeyDown={(e) => {
        const target = e.currentTarget;
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          if (onEnter) onEnter(target.innerHTML);
          else target.blur();
        } else if (e.key === "Backspace" && onEmptyBackspace && isEmpty(target.innerHTML)) {
          e.preventDefault();
          onEmptyBackspace();
        } else if (e.key === "Escape") {
          target.blur();
        }
      }}
      className={`min-w-0 flex-1 whitespace-pre-wrap break-words py-0.5 outline-none empty:before:text-muted empty:before:content-[attr(data-placeholder)] ${
        done ? "text-muted line-through decoration-muted" : ""
      }`}
    />
  );
}

function Row({
  todo,
  focus,
  onFocused,
  onToggle,
  onSave,
  onEnter,
  onEmptyBackspace,
}: {
  todo: TodoItem;
  focus?: boolean;
  onFocused?: () => void;
  onToggle: () => void;
  onSave: (html: string) => void;
  onEnter?: (html: string) => void;
  onEmptyBackspace?: () => void;
}) {
  return (
    <li className={`flex items-start gap-2.5 py-1 ${todo.done ? "opacity-60" : ""}`}>
      <Check done={todo.done} onClick={onToggle} label={todo.done ? "Mark not done" : "Mark done"} />
      <Text
        html={todo.html}
        done={todo.done}
        focus={focus}
        onFocused={onFocused}
        onBlur={onSave}
        onEnter={onEnter}
        onEmptyBackspace={onEmptyBackspace}
        label="Todo"
      />
    </li>
  );
}

// The last line: type and press Enter to add a todo.
function NewRow({ focus, onFocused, onAdd }: { focus: boolean; onFocused: () => void; onAdd: (html: string) => void }) {
  const take = (el: HTMLElement | null) => {
    if (!el) return;
    const html = el.innerHTML;
    if (isEmpty(html)) return;
    el.innerHTML = "";
    onAdd(html);
  };
  const row = useRef<HTMLLIElement>(null);
  return (
    <li ref={row} className="flex items-start gap-2.5 py-1">
      <Check done={false} label="New todo" />
      <Text
        html=""
        placeholder="todo"
        focus={focus}
        onFocused={onFocused}
        label="New todo"
        onBlur={() => take(row.current?.querySelector("[contenteditable]") as HTMLElement | null)}
        onEnter={() => take(row.current?.querySelector("[contenteditable]") as HTMLElement | null)}
      />
    </li>
  );
}
