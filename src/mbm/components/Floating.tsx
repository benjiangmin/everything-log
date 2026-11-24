"use client";

import { useLayoutEffect, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

// A popup (dropdown list, calendar, time picker) drawn over the whole page, so a box it sits in
// can't cut it off. It opens below what it belongs to, or above when there's no room below,
// and follows it when the page scrolls.
export default function Floating({ anchor, popRef, children, className = "", match = true }: { anchor: RefObject<HTMLElement | null>; popRef: RefObject<HTMLDivElement | null>; children: ReactNode; className?: string; match?: boolean }) {
  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.current;
      const p = popRef.current;
      if (!a || !p) return;
      const r = a.getBoundingClientRect();
      if (match) p.style.minWidth = `${r.width}px`;
      const h = p.offsetHeight;
      const w = p.offsetWidth;
      const gap = 6;
      const fitsBelow = r.bottom + gap + h <= window.innerHeight - 8;
      const fitsAbove = r.top - gap - h >= 8;
      p.style.top = `${fitsBelow || !fitsAbove ? r.bottom + gap : r.top - gap - h}px`;
      p.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
      p.style.visibility = "visible";
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  });
  return createPortal(
    <div ref={popRef} style={{ position: "fixed", top: 0, left: 0, visibility: "hidden", zIndex: 1000 }} className={className}>
      {children}
    </div>,
    document.body,
  );
}
