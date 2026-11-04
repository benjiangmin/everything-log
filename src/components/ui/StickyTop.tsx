"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// A bar pinned to the top of the screen that:
//  - reports its own height as the CSS variable --sticky-top, so other sticky things (like a
//    section heading) can sit just below it
//  - shows a soft fade under itself while you scroll, so content looks like it slides beneath.
//    The fade hides once anything marked data-stick-under (e.g. the Expenses heading) is stuck
//    right under the bar, so the two meet cleanly.
export default function StickyTop({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState(false);

  // Measure the bar's height.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty("--sticky-top", `${el.offsetHeight}px`);
    update();
    // Re-measure whenever the bar changes size (e.g. "Jump to current month" appears).
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--sticky-top");
    };
  }, []);

  // Decide whether to show the fade, checked as you scroll (at most once per frame).
  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const barBottom = el.getBoundingClientRect().bottom;
      const somethingStuckUnder = Array.from(document.querySelectorAll("[data-stick-under]")).some(
        (s) => s.getClientRects().length > 0 && s.getBoundingClientRect().top <= barBottom + 1, // (skips hidden ones)
      );
      setFade(window.scrollY > 0 && !somethingStuckUnder);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
      {/* The fade: page color at the top, see-through at the bottom.
          Height: h-6. Strength: the from-paper color stop. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-full h-6 bg-gradient-to-b from-paper to-transparent transition-opacity duration-200 ${
          fade ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
