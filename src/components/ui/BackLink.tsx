"use client";

import { useRouter } from "next/navigation";

// "← Back" at the top of a page: goes to wherever you came from (usually its category page),
// or Home if this page was opened directly. Home itself is in the navigation bar on the left.
export default function BackLink({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push("/");
      }}
      // self-start + text-left: hug the left edge on every page (a stretched button would center its text).
      className={`self-start text-left ${className ?? ""}`}
    >
      ← Back
    </button>
  );
}
