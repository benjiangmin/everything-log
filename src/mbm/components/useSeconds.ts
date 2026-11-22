"use client";

import { useSyncExternalStore } from "react";

// The current time, ticking every second (for a running stopwatch). renderedAt: the server's time
// when it drew the page, so the first paint matches.
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
    }, 1000);
  }
  return () => {
    listeners.delete(l);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useSeconds(renderedAt: number) {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => renderedAt,
  );
}
