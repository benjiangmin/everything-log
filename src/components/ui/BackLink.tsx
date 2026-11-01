"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { parentOf } from "@/app/back-actions";

// "← Back" at the top of a page: goes up a level, to the category page this page lives in
// (not just the last page you were on, so flipping months doesn't get in the way).
// Home if no category links to it. Home itself is in the navigation bar on the left.
const known = new Map<string, string>(); // page → where Back goes (remembered for this visit)

export default function BackLink({ className }: { className?: string }) {
  const [href, setHref] = useState("/");

  // Looked up in the browser (the page's address isn't known while the page is being built).
  useEffect(() => {
    const path = window.location.pathname;
    let live = true;
    const cached = known.get(path);
    (cached ? Promise.resolve(cached) : parentOf(path))
      .then((h) => {
        known.set(path, h);
        if (live) setHref(h);
      })
      .catch(() => {}); // stays Home
    return () => {
      live = false;
    };
  }, []);

  return (
    // self-start + text-left: hug the left edge on every page (a stretched link would center its text).
    <Link href={href} className={`self-start text-left ${className ?? ""}`}>
      ← Back
    </Link>
  );
}
