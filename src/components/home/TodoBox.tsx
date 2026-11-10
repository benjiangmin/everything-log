"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { addTodo, deleteTodo, editTodo, setTodoDone } from "@/app/todo-actions";
import { useUnderBarShadow } from "./sticky";

// The home page's todo list, under Minute by Minute, like the iPhone's Reminders: round check
// circles, hairlines between, "+ New todo" at the bottom. Sticks under the Home bar as you scroll.
//   - "+ New todo" (or Enter in a todo) starts a new one; an empty one just goes away.
//   - ⌘B / ⌘I / ⌘U for bold, italic, underline (no menu).
//   - Check one off: it greys out, is struck through and moves to the bottom. (Reminders hides it
//     right away; here it stays until the end of the day, then it's deleted.)
//   - Backspace in an empty todo deletes it.

export type TodoItem = { id: string; html: string; done: boolean; done_at: string | null; position: number; draft?: boolean };

const sorted = (list: TodoItem[]) =>
  [...list].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.done) return (a.done_at ?? "").localeCompare(b.done_at ?? "");
    return a.position - b.position;
  });
// The fade for a scrolling list: at the top if it's scrolled down, at the bottom if there's more.
function edges(el: HTMLElement | null) {
  if (!el || el.scrollHeight <= el.clientHeight + 1) return null;
  const top = el.scrollTop > 1;
  const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
  if (!top && !bottom) return null;
  return `linear-gradient(to bottom, ${top ? "transparent, black 28px" : "black"}, ${bottom ? "black calc(100% - 28px), transparent" : "black"})`;
}

const isEmpty = (html: string) => !html.replace(/<br\s*\/?>/gi, "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();

export default function TodoBox({ initial }: { initial: TodoItem[] | "missing" }) {
  const box = useRef<HTMLDivElement>(null);
  const stuck = useUnderBarShadow(box);
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
  const done = items.filter((t) => t.done);
  const openCount = open.filter((t) => !t.draft).length;

  // A long list scrolls inside the box; its edges fade where there's more to scroll to.
  const list = useRef<HTMLUListElement>(null);
  const [fade, setFade] = useState<string | null>(null);
  useEffect(() => setFade(edges(list.current)), [items]);

  // How tall the box is, so the home page's subcategory titles stick right under it.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const root = document.documentElement;
    const measure = () => root.style.setProperty("--home-todo-h", `${el.offsetHeight}px`);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--home-todo-h");
    };
  }, []);

  // A new, empty todo after `after` (or at the end), ready to type in. It's only saved once it
  // has something in it.
  function startNew(after?: TodoItem) {
    const i = after ? open.findIndex((t) => t.id === after.id) : open.length - 1;
    const prev = open[i];
    const next = open[i + 1];
    const position = prev ? (next ? (prev.position + next.position) / 2 : prev.position + 1) : next ? next.position - 1 : 0;
    const todo: TodoItem = { id: crypto.randomUUID(), html: "", done: false, done_at: null, position, draft: true };
    setItems((list) => sorted([...list, todo]));
    setFocusId(todo.id);
  }

  function edit(todo: TodoItem, html: string) {
    if (isEmpty(html)) return remove(todo);
    if (todo.draft) {
      setItems((list) => list.map((t) => (t.id === todo.id ? { ...t, html, draft: false } : t)));
      save(() => addTodo(todo.id, html, todo.position));
    } else if (html !== todo.html) {
      setItems((list) => list.map((t) => (t.id === todo.id ? { ...t, html } : t)));
      save(() => editTodo(todo.id, html));
    }
  }

  function remove(todo: TodoItem, focusPrev = false) {
    if (focusPrev) {
      const i = open.findIndex((t) => t.id === todo.id);
      if (i > 0) setFocusId(open[i - 1].id);
    }
    setItems((list) => list.filter((t) => t.id !== todo.id));
    if (!todo.draft) save(() => deleteTodo(todo.id));
  }

  function toggle(todo: TodoItem, html: string) {
    if (isEmpty(html)) return remove(todo);
    const now = !todo.done;
    if (todo.draft) save(() => addTodo(todo.id, html, todo.position).then(() => setTodoDone(todo.id, now)));
    else save(() => setTodoDone(todo.id, now));
    setItems((list) => sorted(list.map((t) => (t.id === todo.id ? { ...t, html, draft: false, done: now, done_at: now ? new Date().toISOString() : null } : t))));
  }

  return (
    // The paper above it covers the gap under the Home bar while it's stuck.
    <div ref={box} data-under-bar className="sticky z-30 -mx-3 mt-3 bg-paper px-3 pt-3" style={{ top: "var(--home-bar-h, 0px)" }}>
      {/* A sheet of paper lifted off the page (the other boxes are outlined or oat), with a dark
          strip for its title, so it doesn't read as one more bar. */}
      <section
        aria-label="Todo"
        className={`overflow-hidden rounded-card bg-paper ring-1 ring-ink/10 transition-shadow ${stuck ? "shadow-xl shadow-ink/25" : "shadow-md shadow-ink/10"}`}
      >
        <div className="flex items-center gap-2.5 bg-surface px-4 py-2.5 text-ink sm:px-5">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 6.5l1.6 1.6L8.5 5M4 13l1.6 1.6L8.5 11.5M4 19.5l1.6 1.6 2.9-3.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 7h8M12 13.5h8M12 20h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <h2 className="flex-1 font-display text-lg font-semibold">Todo</h2>
          {initial !== "missing" && openCount > 0 && (
            <span className="num rounded-full bg-ink/10 px-2.5 py-0.5 text-sm font-semibold text-ink/80">
              {openCount} left
            </span>
          )}
        </div>
        <div className="px-4 pb-1.5 pt-1 sm:px-5">
        {initial === "missing" ? (
          <p className="pb-2 text-sm text-muted">
            Run <code>supabase/todos.sql</code> in Supabase to turn this on.
          </p>
        ) : (
          <>
            <ul
              ref={list}
              onScroll={() => setFade(edges(list.current))}
              className="-mr-2 max-h-[40vh] overflow-y-auto pr-2"
              style={fade ? { maskImage: fade, WebkitMaskImage: fade } : undefined}
            >
              {open.map((t) => (
                <Row
                  key={t.id}
                  todo={t}
                  focus={focusId === t.id}
                  onFocused={() => setFocusId(null)}
                  onToggle={(html) => toggle(t, html)}
                  onSave={(html) => edit(t, html)}
                  onEnter={(html) => {
                    if (isEmpty(html)) return remove(t);
                    edit(t, html);
                    startNew(t);
                  }}
                  onEmptyBackspace={() => remove(t, true)}
                />
              ))}
              {done.map((t) => (
                <Row key={t.id} todo={t} onToggle={(html) => toggle(t, html)} onSave={(html) => edit(t, html)} />
              ))}
            </ul>
            <button
              type="button"
              onClick={() => startNew()}
              className="mt-0.5 flex w-full items-center gap-3 rounded-control py-2 text-left text-sm font-semibold text-accent/80 transition-colors hover:text-accent"
            >
              <span aria-hidden="true" className="grid size-[22px] shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
                </svg>
              </span>
              New todo
            </button>
          </>
        )}
        {error && <p className="pb-2 text-xs text-danger">{error}</p>}
        </div>
      </section>
    </div>
  );
}

// The round check, like Reminders.
function Circle({ done, onClick }: { done: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? "Mark not done" : "Mark done"}
      onMouseDown={(e) => e.preventDefault()} // (keep the text's cursor; its blur would save first)
      onClick={onClick}
      className={`grid size-[22px] shrink-0 place-items-center rounded-full transition-colors ${
        done ? "bg-accent text-accent-ink" : "ring-[1.5px] ring-inset ring-muted/60 hover:ring-ink"
      }`}
    >
      {done && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
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
  onToggle: (html: string) => void;
  onSave: (html: string) => void;
  onEnter?: (html: string) => void;
  onEmptyBackspace?: () => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  // The text's HTML is set by hand (not by React) so typing doesn't jump the cursor.
  useLayoutEffect(() => {
    if (el.current && document.activeElement !== el.current && el.current.innerHTML !== todo.html) el.current.innerHTML = todo.html;
  }, [todo.html]);
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
    <li className="group flex items-start gap-3">
      <span className="py-[9px]">
        <Circle done={todo.done} onClick={() => onToggle(el.current?.innerHTML ?? todo.html)} />
      </span>
      <div
        ref={el}
        role="textbox"
        aria-label="Todo"
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => onSave(e.currentTarget.innerHTML)}
        onPaste={(e) => {
          e.preventDefault(); // plain text only
          document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
        }}
        onKeyDown={(e) => {
          const t = e.currentTarget;
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (onEnter) onEnter(t.innerHTML);
            else t.blur();
          } else if (e.key === "Backspace" && onEmptyBackspace && isEmpty(t.innerHTML)) {
            e.preventDefault();
            onEmptyBackspace();
          } else if (e.key === "Escape") {
            t.blur();
          }
        }}
        className={`min-w-0 flex-1 cursor-text whitespace-pre-wrap break-words border-b border-line py-[9px] text-[15px] leading-[22px] !outline-none group-last:border-b-0 ${
          todo.done ? "text-muted line-through decoration-muted/70" : "text-ink"
        }`}
      />
    </li>
  );
}
