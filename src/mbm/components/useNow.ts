"use client";

import { useSyncExternalStore } from "react";

// The current time, ticking every 15 seconds (for "1h 12m so far" and the now-line on the bar).
// renderedAt: the server's time when it drew the page, so the first paint matches exactly.
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let current = Date.now();

function subscribe(l: () => void) {
  listeners.add(l);
  if (!timer) {
    current = Date.now();
    timer = setInterval(() => {
      current = Date.now();
      listeners.forEach((fn) => fn());
    }, 15000);
  }
  return () => {
    listeners.delete(l);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useNow(renderedAt: number) {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => renderedAt,
  );
}
