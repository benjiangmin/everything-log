"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Keeps Minute by Minute up to date with the phone: fetches the latest every 30 seconds while
// the page is on screen, and right away when you come back to it (switch back to the tab, wake
// the computer). Waits while you're typing, so nothing you're in the middle of jumps.
export default function LiveRefresh({ every = 30 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    let last = Date.now();
    const typing = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.matches("input, textarea, select") || el.isContentEditable);
    };
    const refresh = () => {
      if (document.visibilityState !== "visible" || typing()) return;
      last = Date.now();
      router.refresh();
    };
    const tick = setInterval(() => Date.now() - last >= every * 1000 && refresh(), 5000);
    const back = () => Date.now() - last > 5000 && refresh();
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("focus", back);
    };
  }, [router, every]);
  return null;
}
