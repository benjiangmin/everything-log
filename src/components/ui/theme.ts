"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { sunTimes } from "@/mbm/sun";

// Day / night, kept in this browser, separately for Minute by Minute and for everything-log (the
// same colors; each app has its own switch). Each is one of:
//   day    always light
//   night  always dark
//   sun    dark from sunset to sunrise where you are (Minute by Minute's home spot; Madison until
//          it's known)
// The page shows it as <html data-theme="dark"> (globals.css follows that). The script in the root
// layout sets it before anything's drawn (THEME_SCRIPT), and ThemeSync keeps it right as you move
// between the two apps and as the sun comes up or goes down.

export type ThemeMode = "day" | "night" | "sun";
export type ThemeApp = "mbm" | "log";

export const appOf = (path: string): ThemeApp => (path === "/mbm" || path.startsWith("/mbm/") ? "mbm" : "log");
const keyOf = (app: ThemeApp) => `theme:${app}`;
const WHERE = "theme:where"; // [lat, lng]
const MADISON: [number, number] = [43.0731, -89.4012];

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
export function subscribeDark(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function readMode(app: ThemeApp): ThemeMode {
  try {
    const v = localStorage.getItem(keyOf(app));
    if (v === "day" || v === "night" || v === "sun") return v;
    return localStorage.getItem("theme") === "dark" ? "night" : "day"; // (the old single switch)
  } catch {
    return "day";
  }
}

function where(): [number, number] {
  try {
    const v = JSON.parse(localStorage.getItem(WHERE) ?? "null");
    if (Array.isArray(v) && typeof v[0] === "number" && typeof v[1] === "number") return [v[0], v[1]];
  } catch {}
  return MADISON;
}
// (Minute by Minute's home page tells it where you are, for "sun".)
export function rememberWhere(lat: number, lng: number) {
  try {
    localStorage.setItem(WHERE, JSON.stringify([Math.round(lat * 100) / 100, Math.round(lng * 100) / 100]));
  } catch {}
}

export function darkFor(mode: ThemeMode, now = Date.now()) {
  if (mode !== "sun") return mode === "night";
  const [lat, lng] = where();
  const s = sunTimes(now, lat, lng);
  return s ? now < s.rise || now >= s.set : false;
}

// Puts the right theme on the page for wherever you are now.
export function applyTheme(path = location.pathname) {
  const dark = darkFor(readMode(appOf(path)));
  const root = document.documentElement;
  if (dark === (root.dataset.theme === "dark")) return;
  if (dark) root.dataset.theme = "dark";
  else delete root.dataset.theme;
  notify();
}

export function setMode(app: ThemeApp, mode: ThemeMode) {
  try {
    localStorage.setItem(keyOf(app), mode);
  } catch {}
  applyTheme();
  notify();
}

export function readDark() {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";
}
export const readDarkServer = () => false;

// An app's setting, for its switch.
export function useThemeMode(app: ThemeApp) {
  return useSyncExternalStore(
    subscribeDark,
    () => readMode(app),
    () => "day" as ThemeMode,
  );
}

// In the root layout: the theme follows you between the apps, and the sun through the day.
export function ThemeSync() {
  const path = usePathname();
  useEffect(() => {
    applyTheme(path);
    const id = setInterval(() => applyTheme(path), 60_000);
    return () => clearInterval(id);
  }, [path]);
  return null;
}
