"use client";

import { useSyncExternalStore } from "react";

// When today's Reflect opens (kept in this browser; set on Your account). "HH:MM", 24-hour.
const KEY = "mbm-reflect-at";
export const REFLECT_DEFAULT = "23:00";
const listeners = new Set<() => void>();
let fallback = REFLECT_DEFAULT;

export function readReflectAt() {
  try {
    const v = localStorage.getItem(KEY);
    return v && /^\d{2}:\d{2}$/.test(v) ? v : REFLECT_DEFAULT;
  } catch {
    return fallback;
  }
}
export function setReflectAt(v: string) {
  fallback = v;
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // just for this visit
  }
  listeners.forEach((l) => l());
}
function subscribeAt(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export const useReflectAt = () => useSyncExternalStore(subscribeAt, readReflectAt, () => REFLECT_DEFAULT);

// The clock, by the minute (so the tab unlocks by itself when the time comes).
const minuteListeners = new Set<() => void>();
let minuteTimer: ReturnType<typeof setInterval> | null = null;
let minute = Math.floor(Date.now() / 60000);
function subscribeMinute(l: () => void) {
  minuteListeners.add(l);
  if (!minuteTimer) {
    minute = Math.floor(Date.now() / 60000);
    minuteTimer = setInterval(() => {
      const m = Math.floor(Date.now() / 60000);
      if (m === minute) return;
      minute = m;
      minuteListeners.forEach((fn) => fn());
    }, 5000);
  }
  return () => {
    minuteListeners.delete(l);
    if (!minuteListeners.size && minuteTimer) {
      clearInterval(minuteTimer);
      minuteTimer = null;
    }
  };
}
// (On the server: null, so it's drawn locked until the browser knows the time.)
export const useMinute = () => useSyncExternalStore(subscribeMinute, () => minute, () => null);

// Today's Reflect: open yet? And how long until it is (ms).
export function useReflectOpen() {
  const at = useReflectAt();
  const m = useMinute();
  if (m === null) return { open: false, wait: null as number | null, at };
  const now = new Date(m * 60000);
  const [h, mm] = at.split(":").map(Number);
  const opens = new Date(now);
  opens.setHours(h, mm, 0, 0);
  return { open: +now >= +opens, wait: Math.max(0, +opens - +now), at };
}

// "11:00 PM"
export function atLabel(at: string) {
  const [h, m] = at.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
