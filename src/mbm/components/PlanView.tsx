"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { deletePlan, savePlan, setCalendarHidden } from "@/app/mbm/actions";
import { clock, dayTitle, shiftDay, zonedTime } from "@/mbm/time";
import PlaceField, { type Picked } from "./PlaceField";
import { useNow } from "./useNow";

// The Plan tab: one day on a big bar. Google Calendar's events are on it, and your own plans.
// Like Google Calendar: hover the bar to see where a new hour would go, click to make it (it
// starts on the half hour), then name it, move it, or drag its ends. What's already happened is
// greyed; what's still to come has a dashed edge.

import type { PlanEvent } from "@/mbm/plans";
export type { PlanEvent };
type Draft = {
  id?: string;
  title: string;
  start: number;
  end: number;
  place: Picked;
  toGoogle: boolean;
};

const HALF = 30 * 60_000;
const SNAP = 15 * 60_000;
const HOUR = 60 * 60_000;
const DEFAULT_COLOR = "#b08968";
// (A save that throws, e.g. offline, reads like one that said no.)
const safely = async <T,>(
  f: () => Promise<T>,
): Promise<T | { ok: false; message: string }> => {
  try {
    return await f();
  } catch {
    return {
      ok: false,
      message: "Couldn't save that. Check your connection and try again.",
    };
  }
};
const HOUR_PX = 112; // (the bar is wider than the page: it scrolls sideways)

export default function PlanView({
  day,
  today,
  tz,
  dayStart,
  dayEnd,
  events: initial,
  allDay,
  places,
  google,
  canWrite,
  colors,
  openId,
  renderedAt,
  calendarHidden = false,
}: {
  calendarHidden?: boolean; // Google Calendar's events hidden (here and on the Day bar)
  day: string;
  today: string;
  tz: string;
  dayStart: number;
  dayEnd: number;
  events: PlanEvent[];
  allDay: PlanEvent[];
  places: { id: string; name: string; lat: number; lng: number }[];
  google: { connected: boolean; email: string | null } | null;
  canWrite: boolean;
  colors: Record<string, string>;
  openId: string | null;
  renderedAt: number;
}) {
  const router = useRouter();
  const now = useNow(renderedAt);
  const [events, setEvents] = useState(initial);
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setEvents(initial);
  }
  const [draft, setDraft] = useState<Draft | null>(() => {
    const e = openId ? initial.find((x) => x.id === openId) : null;
    return e ? fromEvent(e) : null;
  });
  const [ghost, setGhost] = useState<number | null>(null); // (where a new hour would start)
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const bar = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const span = dayEnd - dayStart;
  const at = (t: number) =>
    ((Math.min(dayEnd, Math.max(dayStart, t)) - dayStart) / span) * 100;
  const timeAt = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return dayStart + ((clientX - r.left) / r.width) * span;
  };

  // Open the bar at now (today) or at the first plan (another day), with a little room before it.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const first = initial.length
      ? Math.min(...initial.map((e) => +new Date(e.starts_at)))
      : dayStart + 8 * HOUR;
    const t = day === today ? Date.now() : first;
    el.scrollLeft =
      ((t - dayStart) / (dayEnd - dayStart)) * el.scrollWidth - 1.5 * HOUR_PX;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  // Overlapping events share the bar's height (lanes).
  const placed = useMemo(() => {
    const sorted = [...events].sort(
      (a, b) => +new Date(a.starts_at) - +new Date(b.starts_at),
    );
    const lanesEnd: number[] = [];
    return sorted.map((e) => {
      const s = +new Date(e.starts_at);
      let lane = lanesEnd.findIndex((end) => end <= s);
      if (lane === -1) lane = lanesEnd.length;
      lanesEnd[lane] = +new Date(e.ends_at);
      return { e, lane };
    });
  }, [events]);
  const lanes = Math.max(1, ...placed.map((p) => p.lane + 1));

  const colorOf = (title: string) => {
    const t = title.toLowerCase();
    const hit = Object.keys(colors).find(
      (n) => n && (t === n || t.includes(n) || n.includes(t)),
    );
    return hit ? colors[hit] : DEFAULT_COLOR;
  };

  // ---------- Dragging an event (move, or either end), in 15-minute steps ----------
  const drag = useRef<{
    id: string;
    mode: "move" | "start" | "end";
    from: number;
    s: number;
    e: number;
    moved: boolean;
  } | null>(null);
  const [preview, setPreview] = useState<{
    id: string;
    s: number;
    e: number;
  } | null>(null);
  const begin = (
    ev: React.PointerEvent,
    p: PlanEvent,
    mode: "move" | "start" | "end",
  ) => {
    ev.stopPropagation();
    (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
    drag.current = {
      id: p.id,
      mode,
      from: timeAt(ev.clientX),
      s: +new Date(p.starts_at),
      e: +new Date(p.ends_at),
      moved: false,
    };
  };
  const moveDrag = (ev: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const delta = Math.round((timeAt(ev.clientX) - d.from) / SNAP) * SNAP;
    if (delta !== 0) d.moved = true;
    let s = d.s;
    let e = d.e;
    if (d.mode === "move") {
      s += delta;
      e += delta;
    }
    if (d.mode === "start") s = Math.min(d.s + delta, d.e - SNAP);
    if (d.mode === "end") e = Math.max(d.e + delta, d.s + SNAP);
    setPreview({ id: d.id, s, e });
  };
  const endDrag = (p: PlanEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved || !preview) {
      setPreview(null);
      setDraft(fromEvent(p));
      return;
    }
    const { s, e } = preview;
    setPreview(null);
    const next = {
      ...p,
      starts_at: new Date(s).toISOString(),
      ends_at: new Date(e).toISOString(),
    };
    setEvents((list) => list.map((x) => (x.id === p.id ? next : x)));
    start(async () => {
      const res = await safely(() =>
        savePlan({
          id: p.id,
          title: p.title,
          start: next.starts_at,
          end: next.ends_at,
          location: p.location,
          placeId: p.place_id ?? null,
          lat: p.lat ?? null,
          lng: p.lng ?? null,
        }),
      );
      if (!res.ok) {
        setMessage(res.message);
        setEvents((list) => list.map((x) => (x.id === p.id ? p : x)));
      } else router.refresh();
    });
  };

  // ---------- Saving the box ----------
  const save = (d: Draft) =>
    start(async () => {
      const res = await safely(() =>
        savePlan({
          id: d.id,
          title: d.title,
          start: new Date(d.start).toISOString(),
          end: new Date(d.end).toISOString(),
          location: d.place.text || null,
          placeId: d.place.placeId,
          lat: d.place.lat,
          lng: d.place.lng,
          toGoogle: !d.id && d.toGoogle && canWrite,
        }),
      );
      if (!res.ok) return setMessage(res.message);
      setMessage(null);
      setDraft(null);
      router.refresh();
    });
  const remove = (id: string) =>
    start(async () => {
      const res = await safely(() => deletePlan(id));
      if (!res.ok) return setMessage(res.message);
      setEvents((list) => list.filter((x) => x.id !== id));
      setDraft(null);
      router.refresh();
    });

  // ---------- Hours along the bar ----------
  const hours = Array.from(
    { length: 25 },
    (_, h) => +zonedTime(day, h * 60, tz),
  ).filter((t) => t >= dayStart && t <= dayEnd);
  const isToday = day === today;
  const label = (h: number) =>
    h === 0 || h === 24
      ? "12a"
      : h === 12
        ? "12p"
        : h < 12
          ? `${h}a`
          : `${h - 12}p`;

  return (
    <section>
      {/* Which day. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-muted">
            {isToday ? "Today" : day < today ? "Looking back" : "Coming up"}
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            {dayTitle(day)}
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={`/mbm/plan?day=${shiftDay(day, -1)}`}
            aria-label="The day before"
            className="grid size-10 place-items-center rounded-control hover:bg-surface"
          >
            <Chevron dir={-1} />
          </Link>
          {!isToday && (
            <Link
              href="/mbm/plan"
              className="rounded-control px-3 py-2 text-sm font-semibold hover:bg-surface"
            >
              Today
            </Link>
          )}
          <Link
            href={`/mbm/plan?day=${shiftDay(day, 1)}`}
            aria-label="The day after"
            className="grid size-10 place-items-center rounded-control hover:bg-surface"
          >
            <Chevron dir={1} />
          </Link>
        </div>
      </div>

      <GoogleNote google={google} canWrite={canWrite} />
      {google?.connected && (
        <label className="mt-3 inline-flex cursor-pointer items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={!calendarHidden}
            disabled={pending}
            onChange={(e) =>
              start(async () => {
                const res = await safely(() => setCalendarHidden(!e.target.checked));
                if (!res.ok) setMessage(res.message);
                else router.refresh();
              })
            }
            className="size-4 accent-[var(--accent)]"
          />
          Show Google Calendar events
          <span className="text-muted">{calendarHidden ? "(hidden here and on the Day bar; only your own plans show)" : ""}</span>
        </label>
      )}

      {allDay.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {allDay.map((e) => (
            <span
              key={e.id}
              className="rounded-full bg-surface px-3 py-1 text-sm"
            >
              <span className="text-muted">All day · </span>
              {e.title || "Untitled"}
            </span>
          ))}
        </div>
      )}

      {/* The bar. */}
      <div className="mt-5 rounded-card border border-line bg-paper p-4 sm:p-6">
        <div ref={scroller} className="-mx-1 overflow-x-auto px-1 pb-2">
          <div style={{ width: `${(span / HOUR) * HOUR_PX}px` }}>
            <div
              ref={bar}
              className="relative h-56 cursor-copy select-none overflow-hidden rounded-[16px] bg-surface ring-1 ring-inset ring-line"
              onPointerMove={(ev) => {
                if (drag.current) return moveDrag(ev);
                if ((ev.target as Element).closest("[data-event]"))
                  return setGhost(null);
                setGhost(Math.floor(timeAt(ev.clientX) / HALF) * HALF);
              }}
              onPointerLeave={() => setGhost(null)}
              onClick={(ev) => {
                if ((ev.target as Element).closest("[data-event]")) return;
                const s = Math.floor(timeAt(ev.clientX) / HALF) * HALF;
                setDraft({
                  title: "",
                  start: s,
                  end: s + HOUR,
                  place: { text: "", placeId: null, lat: null, lng: null },
                  toGoogle: canWrite,
                });
                setGhost(null);
              }}
            >
              {/* Hour lines. */}
              {hours.map((t, i) => (
                <div
                  key={t}
                  aria-hidden="true"
                  className={`absolute inset-y-0 w-px ${i % 6 === 0 ? "bg-ink/15" : "bg-ink/[0.07]"}`}
                  style={{ left: `${at(t)}%` }}
                />
              ))}
              {/* What's already happened today: a faint wash. */}
              {isToday && (
                <div
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 bg-ink/[0.04]"
                  style={{ width: `${at(now)}%` }}
                />
              )}

              {/* Where a new hour would go. */}
              {ghost !== null && !draft && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-2 rounded-[12px] border-2 border-dashed border-accent/50 bg-accent/5"
                  style={{
                    left: `${at(ghost)}%`,
                    width: `${at(ghost + HOUR) - at(ghost)}%`,
                  }}
                >
                  <span className="absolute left-2 top-1.5 text-xs font-semibold text-accent">
                    {clock(new Date(ghost), tz)}
                  </span>
                </div>
              )}

              {/* The events. */}
              {placed.map(({ e, lane }) => {
                const p = preview?.id === e.id ? preview : null;
                const s = p?.s ?? +new Date(e.starts_at);
                const en = p?.e ?? +new Date(e.ends_at);
                const past = en <= now;
                const live = s <= now && now < en;
                const color = colorOf(e.title);
                const h = 100 / lanes;
                const open = draft?.id === e.id;
                return (
                  <div
                    key={e.id}
                    data-event
                    onPointerDown={(ev) => begin(ev, e, "move")}
                    onPointerMove={moveDrag}
                    onPointerUp={() => endDrag(e)}
                    className={`group absolute cursor-grab overflow-hidden rounded-[12px] px-2.5 py-1.5 text-left transition-shadow active:cursor-grabbing ${open ? "ring-2 ring-ink" : ""} ${
                      past ? "text-muted grayscale" : "text-ink"
                    }`}
                    style={{
                      left: `calc(${at(s)}% + 1px)`,
                      width: `max(calc(${at(en) - at(s)}% - 2px), 6px)`,
                      top: `calc(${lane * h}% + 6px)`,
                      height: `calc(${h}% - 12px)`,
                      background: past
                        ? "#e4dcd1"
                        : live
                          ? `${color}55`
                          : `${color}22`,
                      border: past
                        ? "1px solid #d6cbbd"
                        : live
                          ? `2px solid ${color}`
                          : `2px dashed ${color}`,
                    }}
                    title={`${e.title || "Untitled"} · ${clock(new Date(s), tz)} – ${clock(new Date(en), tz)}${e.location ? ` · ${e.location}` : ""}`}
                  >
                    <span
                      aria-hidden="true"
                      onPointerDown={(ev) => begin(ev, e, "start")}
                      className="absolute inset-y-0 left-0 w-2 cursor-ew-resize"
                    />
                    <span
                      aria-hidden="true"
                      onPointerDown={(ev) => begin(ev, e, "end")}
                      className="absolute inset-y-0 right-0 w-2 cursor-ew-resize"
                    />
                    <p className="truncate text-sm font-semibold leading-tight">
                      {e.title || "Untitled"}
                    </p>
                    <p className="truncate text-xs opacity-75">
                      {clock(new Date(s), tz)} – {clock(new Date(en), tz)}
                    </p>
                    {e.location && (
                      <p className="mt-0.5 truncate text-xs opacity-70">
                        {e.location.split(",")[0]}
                      </p>
                    )}
                  </div>
                );
              })}

              {/* The draft, before it's saved. */}
              {draft && !draft.id && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-2 rounded-[12px] border-2 border-accent bg-accent/15 px-2.5 py-1.5"
                  style={{
                    left: `${at(draft.start)}%`,
                    width: `${at(draft.end) - at(draft.start)}%`,
                  }}
                >
                  <p className="truncate text-sm font-semibold">
                    {draft.title || "New plan"}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {clock(new Date(draft.start), tz)} –{" "}
                    {clock(new Date(draft.end), tz)}
                  </p>
                </div>
              )}

              {isToday && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-[#c0392b]"
                  style={{ left: `${at(now)}%` }}
                />
              )}
            </div>
            <div className="relative mt-2 h-4 text-xs text-muted">
              {hours.map((t, i) => (
                <span
                  key={t}
                  className="num absolute pl-1.5"
                  style={{ left: `${at(t)}%` }}
                >
                  {i < 24 ? label(i) : ""}
                </span>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted">
          Click an empty spot to add an hour. Drag a plan to move it, or its
          edges to change how long. Scroll sideways for the rest of the day.
        </p>
      </div>

      {message && (
        <p
          role="alert"
          className="mt-3 rounded-control bg-surface px-4 py-2.5 text-sm text-danger"
        >
          {message}
        </p>
      )}

      {/* The box: the plan being added or changed. */}
      {draft && (
        <Editor
          key={draft.id ?? `new-${draft.start}`}
          draft={draft}
          day={day}
          tz={tz}
          places={places}
          canWrite={canWrite}
          googleConnected={!!google?.connected}
          pending={pending}
          onCancel={() => setDraft(null)}
          onSave={save}
          onDelete={draft.id ? () => remove(draft.id!) : undefined}
        />
      )}

      {/* The day, as a list. */}
      <div className="mt-6 rounded-card border border-line bg-paper p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold">
          The day&apos;s plans
        </h2>
        {events.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Nothing planned yet. Click the bar above to add something.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {[...events]
              .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))
              .map((e) => {
                const past = +new Date(e.ends_at) <= now;
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => setDraft(fromEvent(e))}
                      className={`-mx-2 flex w-[calc(100%+1rem)] items-center gap-4 rounded-control px-2 py-3 text-left hover:bg-surface ${past ? "opacity-55" : ""}`}
                    >
                      <span
                        className="size-3 shrink-0 rounded-full"
                        style={{ background: colorOf(e.title) }}
                        aria-hidden="true"
                      />
                      <span className="num w-36 shrink-0 text-sm text-muted">
                        {clock(new Date(e.starts_at), tz)} –{" "}
                        {clock(new Date(e.ends_at), tz)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {e.title || "Untitled"}
                        </span>
                        {e.location && (
                          <span className="block truncate text-sm text-muted">
                            {e.location}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-muted">
                        {e.started_block ? "Started · " : e.skipped ? "Skipped · " : ""}
                        {e.id.startsWith("mbm:") ? "Plan" : "Google"}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        )}
      </div>
    </section>
  );
}

function fromEvent(e: PlanEvent): Draft {
  return {
    id: e.id,
    title: e.title,
    start: +new Date(e.starts_at),
    end: +new Date(e.ends_at),
    place: {
      text: e.location ?? "",
      placeId: e.place_id ?? null,
      lat: e.lat ?? null,
      lng: e.lng ?? null,
    },
    toGoogle: !e.id.startsWith("mbm:"),
  };
}

// The box under the bar: name, times, place, and (for a new one) whether it goes to Google.
function Editor({
  draft,
  day,
  tz,
  places,
  canWrite,
  googleConnected,
  pending,
  onCancel,
  onSave,
  onDelete,
}: {
  draft: Draft;
  day: string;
  tz: string;
  places: { id: string; name: string; lat: number; lng: number }[];
  canWrite: boolean;
  googleConnected: boolean;
  pending: boolean;
  onCancel: () => void;
  onSave: (d: Draft) => void;
  onDelete?: () => void;
}) {
  const [d, setD] = useState(draft);
  const field =
    "w-full rounded-control border border-line bg-paper px-3 py-2.5 text-ink focus:border-ink";
  const timeField =
    "rounded-control border border-line bg-paper px-3 py-1.5 text-ink focus:border-ink";
  const hm = (t: number) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(t);
    return parts;
  };
  const fromHm = (v: string) => {
    const [h, m] = v.split(":").map(Number);
    return +zonedTime(day, h * 60 + m, tz);
  };
  const isGoogle = !!d.id && !d.id.startsWith("mbm:");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(d);
      }}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
      className="mt-4 grid gap-4 rounded-card border border-ink/15 bg-paper p-5 shadow-xl shadow-ink/10 sm:grid-cols-[1fr_auto] sm:p-6"
    >
      <div className="grid gap-3">
        <input
          autoFocus
          value={d.title}
          onChange={(e) => setD({ ...d, title: e.target.value })}
          placeholder="Add a title"
          className="w-full border-b border-line bg-transparent pb-2 font-display text-2xl font-semibold text-ink placeholder:text-muted/60 focus:border-ink"
          style={{ outline: "none" }}
        />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">{dayTitle(day)}</span>
          <input
            type="time"
            step={900}
            value={hm(d.start)}
            onChange={(e) =>
              e.target.value &&
              setD({
                ...d,
                start: fromHm(e.target.value),
                end: fromHm(e.target.value) + (d.end - d.start),
              })
            }
            className={timeField}
            style={{ outline: "none" }}
          />
          <span className="text-muted">to</span>
          <input
            type="time"
            step={900}
            value={hm(d.end)}
            onChange={(e) =>
              e.target.value &&
              setD({
                ...d,
                end: Math.max(fromHm(e.target.value), d.start + SNAP),
              })
            }
            className={timeField}
            style={{ outline: "none" }}
          />
        </div>
        <PlaceField
          value={d.place}
          onChange={(place) => setD({ ...d, place })}
          places={places}
          className={field}
        />
        {!d.id && (
          <label
            className={`flex items-center gap-2.5 text-sm ${canWrite ? "cursor-pointer" : "text-muted"}`}
          >
            <input
              type="checkbox"
              disabled={!canWrite}
              checked={d.toGoogle && canWrite}
              onChange={(e) => setD({ ...d, toGoogle: e.target.checked })}
              className="size-4 accent-[var(--accent)]"
            />
            Add to Google Calendar
            {!canWrite && (
              <Link
                href="/mbm/google/connect"
                className="font-semibold text-ink underline underline-offset-2"
              >
                {googleConnected
                  ? "Reconnect Google to allow this"
                  : "Connect Google"}
              </Link>
            )}
          </label>
        )}
        {isGoogle && (
          <p className="text-xs text-muted">
            From your Google Calendar: changes here change it there too.
          </p>
        )}
      </div>
      <div className="flex flex-row items-start gap-2 sm:flex-col sm:items-stretch">
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-control bg-accent px-6 font-semibold text-accent-ink disabled:opacity-60"
        >
          {pending ? "Saving…" : d.id ? "Save" : "Add"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-11 rounded-control px-4 text-sm font-semibold text-muted hover:bg-surface"
        >
          Cancel
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="h-11 rounded-control px-4 text-sm font-semibold text-danger hover:bg-danger/10"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}

function GoogleNote({
  google,
  canWrite,
}: {
  google: { connected: boolean; email: string | null } | null;
  canWrite: boolean;
}) {
  if (google?.connected && canWrite) return null;
  return (
    <p className="mt-3 rounded-control bg-surface px-4 py-2.5 text-sm text-muted">
      {google?.connected ? (
        <>
          Your Google Calendar shows here. To add plans to it and change its
          events from here, Google needs one more yes:{" "}
          <Link
            href="/mbm/google/connect"
            className="font-semibold text-ink underline underline-offset-2"
          >
            reconnect Google
          </Link>
          .
        </>
      ) : (
        <>
          <Link
            href="/mbm/google/connect"
            className="font-semibold text-ink underline underline-offset-2"
          >
            Connect Google Calendar
          </Link>{" "}
          to see your events here, and add plans to it.
        </>
      )}
    </p>
  );
}

function Chevron({ dir }: { dir: 1 | -1 }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d={dir < 0 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
