"use client";

// Night mode on/off: kept in this browser, and on the page as <html data-theme="dark"> (the
// colors in globals.css follow it).
const listeners = new Set<() => void>();

export function readDark() {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";
}
export const readDarkServer = () => false;
export function subscribeDark(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function setDark(on: boolean) {
  if (on) document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  try {
    localStorage.setItem("theme", on ? "dark" : "light");
  } catch {}
  for (const l of listeners) l();
}
