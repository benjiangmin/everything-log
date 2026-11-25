"use client";

import { useEffect, useState } from "react";
import { socialNews, type News } from "@/app/mbm/social/actions";

// The blue "something new" dots on Social: a new follower (Followers), a follow request
// (Requests), or someone accepting yours (Following). Each tab's news is seen once you open that
// tab (kept on this browser). Checked when the page loads, then every minute while it's on screen.
export type SocialTab = keyof News;
const KEY = (t: SocialTab) => `mbm-social-seen-${t}`;
const SEEN = "mbm-social-seen";
let last: News = { followers: null, requests: null, following: null };

const seenAt = (t: SocialTab): string | null => {
  try {
    return localStorage.getItem(KEY(t));
  } catch {
    return null;
  }
};

export function markSocialSeen(t: SocialTab) {
  try {
    localStorage.setItem(KEY(t), new Date().toISOString());
  } catch {}
  window.dispatchEvent(new Event(SEEN));
}

// Which tabs have something you haven't seen.
export function useSocialNews(on = true): Record<SocialTab, boolean> {
  const [news, setNews] = useState<News>(last);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!on) return;
    let live = true;
    const load = () =>
      document.visibilityState === "visible" &&
      socialNews()
        .then((n) => {
          last = n;
          if (!live) return;
          // (The first time on this browser: what's there already counts as seen.)
          for (const t of ["followers", "requests", "following"] as SocialTab[]) if (seenAt(t) === null) markSocialSeen(t);
          setNews(n);
        })
        .catch(() => undefined);
    load();
    const every = setInterval(load, 60_000);
    const seen = () => setTick((x) => x + 1);
    window.addEventListener(SEEN, seen);
    return () => {
      live = false;
      clearInterval(every);
      window.removeEventListener(SEEN, seen);
    };
  }, [on]);
  const fresh = (t: SocialTab) => {
    const at = news[t];
    const seen = seenAt(t);
    return !!at && (!seen || +new Date(at) > +new Date(seen));
  };
  return { followers: fresh("followers"), requests: fresh("requests"), following: fresh("following") };
}

// A small blue dot.
export const NEWS_DOT = "inline-block size-2 shrink-0 rounded-full bg-[#3b82f6]";
