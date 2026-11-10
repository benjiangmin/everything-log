"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { cleanTodoHtml, todayKey } from "@/lib/todos";

// The home page's todo list. NOTE: the whole site sits behind the password lock (src/proxy.ts).

const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const check = (id: string) => {
  if (!isUuid(id)) throw new Error("Bad todo.");
  return id;
};
async function run(p: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await p;
  if (error) throw new Error(`Couldn't save the todo: ${error.message}`);
  revalidatePath("/");
}

export async function addTodo(id: string, html: string, position: number) {
  await run(db().from("todos").insert({ id: check(id), html: cleanTodoHtml(html), position: Number.isFinite(position) ? position : 0 }));
}

export async function editTodo(id: string, html: string) {
  await run(db().from("todos").update({ html: cleanTodoHtml(html) }).eq("id", check(id)));
}

export async function setTodoDone(id: string, done: boolean) {
  await run(
    db()
      .from("todos")
      .update(done ? { done, done_on: todayKey(), done_at: new Date().toISOString() } : { done, done_on: null, done_at: null })
      .eq("id", check(id)),
  );
}

export async function deleteTodo(id: string) {
  await run(db().from("todos").delete().eq("id", check(id)));
}
