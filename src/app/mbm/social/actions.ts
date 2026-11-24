"use server";

import { revalidatePath } from "next/cache";
import { mbm } from "@/mbm/supabase";
import { mbmTz } from "@/mbm/data";

// Social (070_social.sql). Every call goes through the database's own functions, which check
// friendship, blocks and what each person shares before anything comes back.

export type Person = { id: string; username: string | null; name: string | null; avatar: string | null; relation: "self" | "friend" | "sent" | "received" | "blocked" | "none"; trusted?: boolean; at?: string; now?: Now | null };
export type Now = { name: string; color: string; since: string };
export type Share = { now: string; bar: string; stats: string; days: string; map: string };
export type Social = {
  me: { id?: string; username: string | null; name: string | null; avatar: string | null; share: Partial<Share>; now?: Now | null } | null;
  friends: Person[];
  incoming: Person[];
  outgoing: Person[];
  blocked: Person[];
  pinned: string[];
};
export type Slice = { start: string; end: string; name: string; color: string };
export type Profile = Person & {
  day: string;
  today: boolean;
  pinned: string[];
  sees: { now: boolean; bar: boolean; stats: boolean; map: boolean };
  now?: { name: string; color: string; since: string } | null;
  bar?: Slice[];
  stats?: { name: string; color: string; seconds: number }[];
  stops?: { arrived: string; departed: string | null; lat: number; lng: number; name: string | null }[];
  route?: [number, number, string][];
};

type Done = { ok: true } | { ok: false; message: string };
const NEEDS = "Run supabase/minute-by-minute/070_social.sql in Supabase first.";
const isId = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const failed = (m: string): Done => ({ ok: false, message: /function .* does not exist|schema cache|column .* does not exist/i.test(m) ? NEEDS : m });

async function call(fn: string, args: Record<string, unknown> = {}): Promise<Done> {
  const { error } = await (await mbm()).rpc(fn, args);
  if (error) return failed(error.message);
  revalidatePath("/mbm/social", "layout");
  return { ok: true };
}

export async function loadSocial(): Promise<{ ok: true; social: Social } | { ok: false; message: string }> {
  const { data, error } = await (await mbm()).rpc("my_social");
  if (error) return failed(error.message) as { ok: false; message: string };
  return { ok: true, social: data as Social };
}

export async function searchPeople(q: string): Promise<Person[]> {
  if (typeof q !== "string" || q.trim().length < 2) return [];
  const { data } = await (await mbm()).rpc("search_users", { p_q: q.slice(0, 40) });
  return (data as Person[] | null) ?? [];
}

export async function loadProfile(username: string, day?: string): Promise<Profile | null> {
  const client = await mbm();
  const { data: who } = await client.rpc("search_users", { p_q: username.slice(0, 40) });
  const person = ((who as Person[] | null) ?? []).find((p) => p.username?.toLowerCase() === username.toLowerCase());
  const mine = person ? null : ((await client.rpc("my_social")).data as Social | null);
  const id = person?.id ?? mine?.friends?.find((f) => f.username?.toLowerCase() === username.toLowerCase())?.id ?? (mine?.me?.username?.toLowerCase() === username.toLowerCase() ? mine?.me?.id : undefined);
  if (!id) return null;
  const { data } = await client.rpc("social_profile", { p_user: id, p_day: day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null, p_tz: mbmTz() });
  return (data as Profile | null) ?? null;
}

export async function setUsername(username: string): Promise<Done> {
  const { data, error } = await (await mbm()).rpc("set_username", { p_username: String(username ?? "").slice(0, 40) });
  if (error) return failed(error.message);
  if (data) return { ok: false, message: data as string };
  revalidatePath("/mbm", "layout");
  return { ok: true };
}

export async function setShare(share: Share): Promise<Done> {
  return call("set_share", { p_share: share });
}

export async function friendRequest(id: string): Promise<Done> {
  if (!isId(id)) return { ok: false, message: "Not found." };
  const { data, error } = await (await mbm()).rpc("friend_request", { p_to: id });
  if (error) return failed(error.message);
  if (data === "not found") return { ok: false, message: "Not found." };
  revalidatePath("/mbm/social", "layout");
  return { ok: true };
}

export async function answerRequest(id: string, accept: boolean): Promise<Done> {
  return isId(id) ? call("answer_request", { p_from: id, p_accept: !!accept }) : { ok: false, message: "Not found." };
}
export async function cancelRequest(id: string): Promise<Done> {
  return isId(id) ? call("cancel_request", { p_to: id }) : { ok: false, message: "Not found." };
}
export async function unfriend(id: string): Promise<Done> {
  return isId(id) ? call("unfriend", { p_them: id }) : { ok: false, message: "Not found." };
}
export async function setTrusted(id: string, trusted: boolean): Promise<Done> {
  return isId(id) ? call("set_trusted", { p_them: id, p_trusted: !!trusted }) : { ok: false, message: "Not found." };
}
export async function blockUser(id: string): Promise<Done> {
  return isId(id) ? call("block_user", { p_them: id }) : { ok: false, message: "Not found." };
}
export async function unblockUser(id: string): Promise<Done> {
  return isId(id) ? call("unblock_user", { p_them: id }) : { ok: false, message: "Not found." };
}

// A day you share (or stop sharing) with whoever the "days" setting allows.
export async function pinDay(day: string, on: boolean): Promise<Done> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, message: "Pick a day." };
  const client = await mbm();
  const { error } = on ? await client.from("shared_days").upsert({ day }) : await client.from("shared_days").delete().eq("day", day);
  if (error) return failed(error.message);
  revalidatePath("/mbm/social", "layout");
  return { ok: true };
}

// A job or category others see as "Busy".
export async function setPrivate(kind: "job" | "category", id: string, on: boolean): Promise<Done> {
  if (!isId(id)) return { ok: false, message: "Not found." };
  const { error } = await (await mbm()).from(kind === "job" ? "activities" : "categories").update({ private: !!on }).eq("id", id);
  if (error) return failed(error.message);
  revalidatePath("/mbm/account/jobs");
  return { ok: true };
}
