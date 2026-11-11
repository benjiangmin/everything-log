"use client";

import { useEffect, useState, useTransition } from "react";
import { bestGuesses, nowInfo, startEntry, type Guess } from "@/app/mbm/actions";
import type { NowInfo } from "@/mbm/data";
import { clock, dayKeyOf, hhmm, zonedTime } from "@/mbm/time";
import ActivityInput from "./ActivityInput";
import SidePanel from "./SidePanel";

type Since = "last" | "now" | "custom";

// "What are you doing?": type it (or tap one of your usual ones) and it starts.
//   + Start / the sidebar: what's already running keeps going (stop each one from the page).
//   Switch (switching): what's running stops, and the new thing takes over from that moment.
// By default it starts "since last entry": when the last entry ended (switching: now).
export default function NowPanel({ switching = false, onClose }: { switching?: boolean; onClose: () => void }) {
  const [info, setInfo] = useState<NowInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [since, setSince] = useState<Since>("last");
  const [custom, setCustom] = useState("");
  const [pending, run] = useTransition();
  const [guesses, setGuesses] = useState<Guess[]>([]);

  // Best guesses for right now (your history, where you are, your calendar): at most two.
  useEffect(() => {
    let live = true;
    bestGuesses()
      .then((g) => live && setGuesses(g))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    nowInfo().then((res) => {
      if (!live) return;
      if (res.ok) {
        setInfo(res.info);
        setCustom(hhmm(new Date(res.info.loadedAt), res.info.tz));
      } else setError(res.message);
    });
    return () => {
      live = false;
    };
  }, []);

  const tz = info?.tz ?? "America/Chicago";
  const byId = new Map((info?.activities ?? []).map((a) => [a.id, a]));
  const running = info?.running ?? [];
  const names = running.map((b) => (b.activity_id ? byId.get(b.activity_id)?.name : null) ?? "Something");

  // What "since last entry" means right now, shown on the button.
  const lastLabel = (() => {
    if (!info) return "";
    if (switching && running.length) return "now"; // what's running stops now: that's the last entry
    if (!info.lastEnd) return "now";
    const sameDay = dayKeyOf(new Date(info.lastEnd), tz) === dayKeyOf(new Date(info.loadedAt), tz);
    const t = clock(info.lastEnd, tz);
    return sameDay ? t : `${new Date(info.lastEnd).toLocaleDateString("en-US", { timeZone: tz, weekday: "short" })} ${t}`;
  })();

  function go(name: string) {
    if (!name.trim() || !info) return;
    let sinceValue: string = since;
    if (since === "custom") {
      if (!custom) return setError("Pick a time.");
      const [h, m] = custom.split(":").map(Number);
      sinceValue = zonedTime(dayKeyOf(new Date(), tz), h * 60 + m, tz).toISOString();
    }
    setError(null);
    run(async () => {
      const res = await startEntry({ name, since: sinceValue, stopRunning: switching });
      if (res.ok) onClose();
      else setError(res.message);
    });
  }

  const seg = (on: boolean) => `rounded-[9px] px-3 py-1.5 text-sm font-semibold transition-colors ${on ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"}`;

  return (
    <SidePanel
      title={switching && running.length ? "Switch to…" : "What are you doing?"}
      subtitle={
        info
          ? running.length
            ? switching
              ? `Stops ${names.join(", ")}`
              : `Also running: ${names.join(", ")} (keeps going)`
            : "Nothing running right now"
          : error
            ? ""
            : "Loading…"
      }
      onClose={onClose}
    >
      {info && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            go(text);
          }}
          className={`flex flex-col gap-4 ${pending ? "opacity-70" : ""}`}
        >
          {guesses.length > 0 && !text && (
            <div aria-label="Best guesses" className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-ink">Best guess{guesses.length > 1 ? "es" : ""}</p>
              {guesses.map((g) => (
                <button
                  key={g.activity_id}
                  type="button"
                  disabled={pending}
                  onClick={() => go(g.name)}
                  className="flex items-center gap-3 rounded-control bg-surface px-3.5 py-2.5 text-left ring-1 ring-line transition-colors hover:bg-line/60"
                >
                  <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ background: g.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">{g.name}</span>
                    {g.why[0] && <span className="block truncate text-xs text-muted">{g.why.slice(0, 2).join(" · ")}</span>}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-muted">Start →</span>
                </button>
              ))}
            </div>
          )}
          <ActivityInput activities={info.activities} value={text} onChange={setText} onEnter={go} placeholder={guesses.length ? "Or type something else…" : "Cooking, Class, Gaming…"} autoFocus />

          {/* Started when */}
          <div>
            <p className="mb-1.5 text-sm font-semibold text-ink">Started</p>
            <div role="radiogroup" aria-label="Started" className="inline-flex flex-wrap rounded-control bg-surface p-1 ring-1 ring-line">
              <button type="button" role="radio" aria-checked={since === "last"} onClick={() => setSince("last")} className={seg(since === "last")}>
                Since last entry{lastLabel && <span className="font-normal opacity-75"> · {lastLabel}</span>}
              </button>
              <button type="button" role="radio" aria-checked={since === "now"} onClick={() => setSince("now")} className={seg(since === "now")}>
                Now
              </button>
              <button type="button" role="radio" aria-checked={since === "custom"} onClick={() => setSince("custom")} className={seg(since === "custom")}>
                Custom
              </button>
            </div>
            {since === "custom" && (
              <input
                type="time"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                aria-label="Started at"
                autoFocus
                className="num mt-2 block rounded-control border border-line bg-paper px-3 py-2 text-ink focus:border-ink"
                style={{ outline: "none" }}
              />
            )}
          </div>

          <button
            type="submit"
            disabled={pending || !text.trim()}
            className="h-11 rounded-control bg-accent font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Starting…" : switching && running.length ? "Switch" : "Start"}
          </button>
        </form>
      )}
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </SidePanel>
  );
}
