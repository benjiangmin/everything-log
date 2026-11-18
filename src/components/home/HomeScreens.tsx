"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// The home page is two screens you snap between: Home (Minute by Minute and your todos) and
// Documents (your categories). Scrolling settles on one or the other; a grey arrow in the corner
// says the other one is there (and takes you to it).
export default function HomeScreens({ home, documents }: { home: ReactNode; documents: ReactNode }) {
  const homeRef = useRef<HTMLElement>(null);
  const docsRef = useRef<HTMLElement>(null);
  const [onDocs, setOnDocs] = useState(false);

  // Snap scrolling, on this page only.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("home-snap");
    return () => root.classList.remove("home-snap");
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
    </button>
  );

  return (
    <>
      <section ref={homeRef} aria-label="Home" className="relative flex min-h-[100svh] snap-start flex-col pb-20 pt-8 sm:pt-14">
        {home}
        {/* Bottom-left: Documents are below. */}
        {arrow(false, `absolute bottom-5 -left-2 ${onDocs ? "opacity-0" : ""}`)}
      </section>
      <section ref={docsRef} aria-label="Documents" className="relative min-h-[100svh] snap-start pb-24 pt-2">
        {/* Top-left: Home is above. */}
        {arrow(true, "-ml-2 mb-1")}
        {documents}
      </section>
    </>
  );
}
