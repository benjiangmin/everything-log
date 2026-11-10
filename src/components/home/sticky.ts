"use client";

import { useEffect, useState, type RefObject } from "react";

// The home page's sticky bits: the Home bar (top) and, under it, the todo box. Whichever is the
// lowest one stuck gets a shadow once the page is scrolled (there's something above to scroll
// back up to), so you can see the page going underneath.

const BAR_VAR = "--home-bar-h";
const isStuck = (el: Element | null, top: number) => !!el && el.getBoundingClientRect().top <= top + 0.5;

// The Home bar's strip: tells the page its height (the todo box sticks right under it), and
// whether it should cast the shadow.
export function useBarShadow(ref: RefObject<HTMLElement | null>, on: boolean) {
  const [shadow, setShadow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!on || !el) return;
    const root = document.documentElement;
    const measure = () => root.style.setProperty(BAR_VAR, `${el.offsetHeight}px`);
    const update = () => setShadow(window.scrollY > 2 && !isStuck(document.querySelector("[data-under-bar]"), el.offsetHeight));
    measure();
    update();
    const ro = new ResizeObserver(() => {
      measure();
      update();
    });
    ro.observe(el);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      root.style.removeProperty(BAR_VAR);
    };
  }, [ref, on]);
  return shadow;
}

// Something stuck right under the Home bar: true while it's stuck there (and so has the shadow).
export function useUnderBarShadow(ref: RefObject<HTMLElement | null>) {
  const [shadow, setShadow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(BAR_VAR)) || 0;
      setShadow(window.scrollY > 2 && isStuck(el, bar));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [ref]);
  return shadow;
}

// A soft shadow along the bottom edge only.
export const EDGE_SHADOW = "shadow-[0_14px_14px_-12px_rgba(43,28,20,0.28)]";
