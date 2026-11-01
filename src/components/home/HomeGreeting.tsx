"use client";

import { useSyncExternalStore } from "react";

// The top of the home page: a greeting (picked fresh each visit, sometimes for the time of day,
// sometimes just random), and a live clock. It's drawn in the browser so it uses your clock.

const NAME = "Benj";

const BY_TIME: Record<"morning" | "afternoon" | "evening" | "late", string[]> = {
  morning: ["Good morning", "Morning", "Rise and shine", "早上好", "Top of the morning", "Mornin'"],
  afternoon: ["Good afternoon", "Afternoon", "Hope the day's going well", "下午好"],
  evening: ["Good evening", "Evening", "Winding down", "晚上好"],
  late: ["Up late", "Night owl hours", "Still up", "Burning the midnight oil"],
};
const ANYTIME = ["Welcome back", "Hi", "Hey", "Hello", "Sup", "Yo", "Nihao", "你好", "Howdy", "Hey there", "Good to see you", "Ahoy", "Hiya", "What's up"];

function part(hour: number) {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "late";
}

const pickFrom = (list: string[]) => list[Math.floor(Math.random() * list.length)];

// Picked once per page load (and kept, so it doesn't change every second).
let greeting: string | null = null;
const readGreeting = () => (greeting ??= Math.random() < 0.55 ? pickFrom(BY_TIME[part(new Date().getHours())]) : pickFrom(ANYTIME));

// The clock: the current second, ticking.
const tick = (onChange: () => void) => {
  const id = setInterval(onChange, 250); // checks 4×/s so the seconds never skip
  return () => clearInterval(id);
};
const readSecond = () => Math.floor(Date.now() / 1000);
const none = () => null;
const noop = () => () => {};

export default function HomeGreeting() {
  const hello = useSyncExternalStore(noop, readGreeting, none);
  const second = useSyncExternalStore(tick, readSecond, none);
  const now = second === null ? null : new Date(second * 1000);

  return (
    <header className="mb-10 sm:mb-14">
      <h1 className="font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
        {hello ? (
          <>
            {hello}, <span className="text-accent">{NAME}</span>
          </>
        ) : (
          <span className="invisible">Hello, {NAME}</span>
        )}
      </h1>
      <p className="mt-3 flex flex-wrap items-baseline gap-x-3 text-muted">
        <span className="font-display text-2xl font-medium tabular-nums text-ink sm:text-3xl">
          {now ? now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" }) : " "}
        </span>
        <span className="text-base">{now?.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
      </p>
    </header>
  );
}
