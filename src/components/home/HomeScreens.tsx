"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// The home page is two screens: Home (Minute by Minute and your todos) and Documents (your
// categories). Scrolling between them glides all the way to one or the other; a grey arrow in
// the corner says the other one is there (and takes you to it).
// docsBadge: shown on the "Documents" arrow (the red "!" when something in there needs you).
export default function HomeScreens({ home, documents, docsBadge }: { home: ReactNode; documents: ReactNode; docsBadge?: ReactNode }) {
  const homeRef = useRef<HTMLElement>(null);
  const docsRef = useRef<HTMLElement>(null);
  const [onDocs, setOnDocs] = useState(false);

  // Moving between the two screens, however you scroll (wheel, trackpad, swipe, keys): one smooth
  // glide, the same as the arrows, instead of the browser's quick snap. Inside the Documents
  // screen (below its top) you scroll normally, and so does anything that scrolls by itself
  // (a long todo list).
  useEffect(() => {
    const docs = docsRef.current;
    if (!docs) return;
    const docsTop = () => docs.getBoundingClientRect().top + window.scrollY;
    let moving = false;
    let quietUntil = 0; // (after a glide, the trackpad's leftover momentum is swallowed)
    let settle: ReturnType<typeof setTimeout> | undefined;
    let lastY = window.scrollY;
    let reachedTopAt = 0; // (when scrolling up through Documents got to its top)
    // It takes a proper push to go to the other screen, not a nudge: the scrolling adds up (one
    // way, without a pause) until it's enough. (Pixels; a mouse wheel's notch is about 100.)
    const PUSH = 160;
    let pushed = 0;
    let pushedAt = 0;

    const glide = (top: number) => {
      moving = true;
      window.scrollTo({ top, behavior: "smooth" });
      const done = () => {
        if (!moving) return;
        moving = false;
        quietUntil = Date.now() + 500;
        window.removeEventListener("scrollend", done);
      };
      window.addEventListener("scrollend", done);
      setTimeout(done, 1000); // (browsers without scrollend)
    };
    // Which way a gesture should go from where you are: to Documents, to Home, or let it scroll.
    const decide = (down: boolean): "docs" | "home" | null => {
      const y = window.scrollY;
      const top = docsTop();
      if (y < top - 2) return down ? "docs" : y > 0 ? "home" : null; // on Home (or between)
      if (y <= top + 2 && !down) return "home"; // at the top of Documents, going up
      return null;
    };
    // Something under the pointer that can scroll that way itself.
    const scrollsItself = (el: EventTarget | null, down: boolean) => {
      for (let n = el as HTMLElement | null; n && n !== document.body; n = n.parentElement) {
        const o = getComputedStyle(n).overflowY;
        if ((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight + 1) {
          if (down ? n.scrollTop + n.clientHeight < n.scrollHeight - 1 : n.scrollTop > 0) return true;
        }
      }
      return false;
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // (zooming, sideways)
      const down = e.deltaY > 0;
      if (moving || Date.now() < quietUntil) {
        if (decide(down) || moving) e.preventDefault();
        return;
      }
      if (scrollsItself(e.target, down)) return;
      const to = decide(down);
      if (!to) return;
      e.preventDefault();
      if (Math.abs(e.deltaY) < 3) return; // (the tail end of a gesture)
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY; // (lines → pixels)
      if (Date.now() - pushedAt > 350 || Math.sign(dy) !== Math.sign(pushed)) pushed = 0;
      pushed += dy;
      pushedAt = Date.now();
      if (Math.abs(pushed) < PUSH) return;
      pushed = 0;
      // Scrolled up to the top of Documents just now: stop there. It takes a fresh scroll up to
      // go on to Home (so a flick through your categories doesn't fly past their top).
      if (to === "home" && window.scrollY >= docsTop() - 2 && Date.now() - reachedTopAt < 450) {
        reachedTopAt = Date.now();
        return;
      }
      glide(to === "docs" ? docsTop() : 0);
    };

    let startY = 0;
    let startTarget: EventTarget | null = null;
    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
      startTarget = e.target;
    };
    const onTouchMove = (e: TouchEvent) => {
      const down = e.touches[0].clientY < startY; // (finger up: page goes down)
      if (moving || (!scrollsItself(startTarget, down) && decide(down))) e.preventDefault();
    };
    const onTouchEnd = (e: TouchEvent) => {
      const dy = startY - e.changedTouches[0].clientY;
      if (moving || Math.abs(dy) < 110 || scrollsItself(startTarget, dy > 0)) return; // (a proper swipe, not a nudge)
      const to = decide(dy > 0);
      if (to) glide(to === "docs" ? docsTop() : 0);
    };

    // Keys (Page Down, space, arrows) or a scrollbar drag that stops between the two screens:
    // glide on to the nearer one.
    const onScroll = () => {
      const y0 = window.scrollY;
      if (!moving && y0 <= docsTop() + 2 && lastY > docsTop() + 2) reachedTopAt = Date.now();
      lastY = y0;
      clearTimeout(settle);
      settle = setTimeout(() => {
        if (moving) return;
        const y = window.scrollY;
        const top = docsTop();
        if (y > 2 && y < top - 2) glide(y > top / 2 ? top : 0);
      }, 140);
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(settle);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Which screen you're on (for the arrows).
  useEffect(() => {
    const docs = docsRef.current;
    if (!docs) return;
    const update = () => setOnDocs(docs.getBoundingClientRect().top < window.innerHeight / 2);
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const go = (to: "home" | "docs") => (to === "home" ? homeRef : docsRef).current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const arrow = (up: boolean, className: string) => (
    <button
      type="button"
      onClick={() => go(up ? "home" : "docs")}
      aria-label={up ? "Up to Home" : "Down to Documents"}
      className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-sm font-semibold text-muted transition-colors hover:text-ink ${className}`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={up ? "rotate-180" : ""}>
        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {up ? "Home" : "Documents"}
      {!up && docsBadge && <span className="relative ml-1 inline-block size-4">{docsBadge}</span>}
    </button>
  );

  return (
    <>
      <section ref={homeRef} aria-label="Home" className="relative isolate flex min-h-[100svh] flex-col pb-20 pt-8 sm:pt-14">
        {/* 江, big and faint behind it all: the family name. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <span
            className="absolute -bottom-[6%] right-[-4%] select-none text-[min(70vw,34rem)] leading-none text-accent opacity-[0.06]"
            style={{ fontFamily: '"Songti SC", "STSong", "Noto Serif SC", "Source Han Serif SC", serif' }}
          >
            江
          </span>
        </div>
        {home}
        {/* Bottom-left: Documents are below. */}
        {arrow(false, `absolute bottom-5 -left-2 ${onDocs ? "opacity-0" : ""}`)}
      </section>
      <section ref={docsRef} aria-label="Documents" className="relative min-h-[100svh] pb-24 pt-2">
        {/* Top-left: Home is above. */}
        {arrow(true, "-ml-2 mb-1")}
        {documents}
      </section>
    </>
  );
}
