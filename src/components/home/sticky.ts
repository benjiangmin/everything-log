"use client";

import { useEffect, useState, type RefObject } from "react";

// The home page's sticky bits: the Home bar (top) and, under it, the todo box.

const BAR_VAR = "--home-bar-h";

// The Home bar tells the page its height: the todo box sticks right under it.
export function useBarHeight(ref: RefObject<HTMLElement | null>, on: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!on || !el) return;
    const root = document.documentElement;
    const measure = () => root.style.setProperty(BAR_VAR, `${el.offsetHeight}px`);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty(BAR_VAR);
    };
  }, [ref, on]);
}

// Something stuck right under the Home bar: true while it's stuck there (the page scrolling
// under it), so it can take the same shadow as the other boxes.
export function useUnderBarShadow(ref: RefObject<HTMLElement | null>) {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(BAR_VAR)) || 0;
      setStuck(window.scrollY > 2 && el.getBoundingClientRect().top <= bar + 0.5);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [ref]);
  return stuck;
}
