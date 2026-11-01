import "server-only";
import { db } from "./supabase";

// The "lock other devices" number (supabase/site-lock.sql). It's part of every unlock cookie's
// fingerprint, so bumping it signs out every other browser.
//
// The lock check runs on every page load, so the number is remembered for 30 seconds instead of
// asked for each time. (So another device can stay unlocked for up to ~30s after you press it.)
// If the table isn't there yet or Supabase can't be reached, it falls back to the last known
// number (0 at first), so the site never locks you out by accident.
const REMEMBER_MS = 30_000;
let cached: { epoch: number; at: number } | null = null;

export async function getLockEpoch(): Promise<number> {
  if (cached && Date.now() - cached.at < REMEMBER_MS) return cached.epoch;
  try {
    const { data, error } = await db().from("site_lock").select("epoch").eq("id", 1).maybeSingle();
    if (error) throw error;
    cached = { epoch: data?.epoch ?? 0, at: Date.now() };
  } catch {
    cached = { epoch: cached?.epoch ?? 0, at: Date.now() };
  }
  return cached.epoch;
}

// Bump the number (signs out every other browser). Returns the new one.
export async function bumpLockEpoch(): Promise<number> {
  const current = await db().from("site_lock").select("epoch").eq("id", 1).maybeSingle();
  if (current.error) throw new Error(`Couldn't lock other devices: ${current.error.message}`);
  const next = (current.data?.epoch ?? 0) + 1;
  const res = await db().from("site_lock").upsert({ id: 1, epoch: next });
  if (res.error) throw new Error(`Couldn't lock other devices: ${res.error.message}`);
  cached = { epoch: next, at: Date.now() };
  return next;
}
