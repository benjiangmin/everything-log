"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { APIProvider, InfoWindow, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { useRouter } from "next/navigation";
import { lockDay, lookupPlaceOutline, moveStop, myPlaces, rememberedRoute, removeStop, reportRoute, trustedRoutes, saveBlock, setPlaceOutline, setStopOutline, setStopPlace, trailCells, type PlaceLite, type PlacePick } from "@/app/mbm/actions";
import { Search as PlaceSearch, type Found } from "./PlaceSearch";

// Which version of the path engine drew a route (saved with "Route looks wrong" reports).
const PATH_ENGINE = "legs+trails+match-v2 (2026-11-18: your dots win on your own paths)";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import type { Activity, Block, LockedTrip, RoutePoint, Visit } from "@/mbm/data";
import { clock, dayRange, span } from "@/mbm/time";
import { HtmlMarker, KEY, stylesFor } from "./mapBits";
import { fitToEntries, buildTrips, decodePolyline, metres, type Piece, type Spot, type Trip } from "@/mbm/trips";
import { encodePolyline, snapLeg } from "@/mbm/snap";
import { splitLegs, waitSpot, type Dot } from "@/mbm/legs";
import { despike, makeTrails, smooth } from "@/mbm/trails";
import { buildingAt, nearOutline } from "@/mbm/buildings";
import { isMoving } from "@/mbm/moving";
import { fitsTrusted } from "@/mbm/routefit";

// The stretch you're hovering on the day bar. moving: light up the route (Commute); still: the
// stop you were at (everything else); any: both (untracked time).
export type Focus = { start: number; end: number; kind: "moving" | "still" | "any" };
// A plan you're hovering on the day bar: where it'll be (at: null when it has no place).
type Pin = { title: string; location: string | null; at: { lat: number; lng: number } | null };

// The day on a map: each stop, and the trips between them (from the iPhone's dots). Stops are
// labelled with their name (yours, or the one the phone found, like "Noland Hall"). Click a stop to rename it; later
// visits there get the name by themselves. Hovering the day bar highlights where you were then.
export default function DayMapInner({
  visits: phoneVisits,
  points,
  tz,
  focus,
  pin = null,
  showDots = false,
  liveColor = null,
  blocks = [],
  activities = [],
  onPointer,
  gestures = "cooperative",
  topCover = 0,
  dayKey,
  finished = false,
  locked = null,
}: {
  dayKey?: string;
  finished?: boolean; // the day's over: once drawn, its routes are saved (034_locked_days.sql)
  locked?: LockedTrip[] | null; // its saved routes: drawn as they are, nothing worked out again
  gestures?: "cooperative" | "greedy";
  topCover?: number; // px at the top covered by something floating on the map: fit the day below it
  visits: Visit[];
  points: RoutePoint[];
  blocks?: Block[];
  activities?: Activity[];
  onPointer?: (spans: { start: number; end: number }[] | null) => void; // what you're pointing at, for the day bar
  tz: string;
  focus: Focus | null;
  pin?: Pin | null;
  showDots?: boolean; // every recorded dot, to see what the phone actually got
  liveColor?: string | null; // today: show where you are now, pulsing, in this color
}) {
  const [open, setOpen] = useState<Visit | null>(null);
  const [refit, setRefit] = useState(0); // (bumped by "Whole day": zoom back out to all of it)
  const [moving, setMoving] = useState<Visit | null>(null); // "click where it really is"
  const [moveNote, setMoveNote] = useState<string | null>(null);
  const [, runMove] = useTransition();
  // A trip you clicked: "Add as Commute" (when nothing's tracked for it), and "Route looks wrong".
  const [adding, setAdding] = useState<{ trip: Trip; x: number; y: number; untracked: boolean; below?: boolean; note?: string; report?: "writing" | "sent" } | null>(null);
  const [reportText, setReportText] = useState("");
  const [stars, setStars] = useState(0); // (rating a route: 1-5, 0 = not picked yet)
  const [addPending, runAdd] = useTransition();
  const [zoom, setZoom] = useState(15);
  // What the pointer is on: trips under it (several, where paths overlap) or a stop.
  const [pointed, setPointed] = useState<{ trips: string[]; stops: string[]; x: number; y: number; cover?: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // A stop whose building is known but whose spot is out on the street (GPS wanders indoors): it's
  // drawn in the middle of the building, and its routes go there.
  const visits = useMemo(() => phoneVisits.map((v) => (v.outline && !nearOutline(v.outline, v.lat, v.lng, 0) ? { ...v, ...middleOf(v.outline) } : v)), [phoneVisits]);
  const day = useMemo(() => {
    if (!dayKey) return null;
    const r = dayRange(dayKey, tz);
    return { start: +r.start, end: +r.end };
  }, [dayKey, tz]);
  const built = useMemo(() => (locked ? [] : fitToEntries(buildTrips(visits, points), blocks)), [visits, points, blocks, locked]);
  const filled = useFilledTrips(built, points);
  const trips: Trip[] = useMemo(() => (locked ? reattach(locked as unknown as Trip[], visits) : filled.trips), [locked, filled.trips, visits]);
  // A finished day, all drawn: save its routes, so it's never redrawn differently later.
  const saved = useRef(false);
  useEffect(() => {
    if (locked || !finished || !dayKey || !filled.settled || saved.current || !filled.trips.length) return;
    const t = setTimeout(() => {
      saved.current = true;
      const strip = (x: Trip): LockedTrip => ({
        key: x.key,
        start: x.start,
        end: x.end,
        fromId: x.fromId ?? null,
        toId: x.toId ?? null,
        pace: x.pace ?? null,
        pieces: x.pieces.map((p) => ({ path: p.path.map((s) => ({ lat: Math.round(s.lat * 1e6) / 1e6, lng: Math.round(s.lng * 1e6) / 1e6 })), missing: p.missing })),
        waits: x.waits ?? [],
      });
      lockDay(dayKey, filled.trips.map(strip)).catch(() => undefined);
    }, 4000);
    return () => clearTimeout(t);
  }, [locked, finished, dayKey, filled.settled, filled.trips]);
  const buildings = usePlaceBuildings(visits);
  // What lights up for the hovered stretch: the trips (moving) or the stops (still) during it.
  const barLit = useMemo(() => {
    if (!focus) return null;
    // (Overlapping by more than a moment: a trip that ends just as an untracked stretch begins
    // isn't part of it.)
    const overlaps = (a: number, b: number) => Math.min(b, focus.end) - Math.max(a, focus.start) > Math.min(60_000, (focus.end - focus.start) / 2);
    const trip = new Set(focus.kind === "still" ? [] : trips.filter((t) => overlaps(t.start, t.end)).map((t) => t.key));
    const stops = new Set(
      focus.kind === "moving"
        ? []
        : visits.filter((v) => overlaps(+new Date(v.arrived_at), v.departed_at ? +new Date(v.departed_at) : Infinity)).map((v) => v.id),
    );
    return { trip, stops };
  }, [focus, trips, visits]);
  const lit = pointed ? { trip: new Set(pointed.trips), stops: new Set(pointed.stops) } : barLit;

  // Pointing at something on the map: light it up here, and tell the day bar its times.
  const point = (p: { trips: string[]; stops: string[]; x: number; y: number } | null) => {
    setPointed(p && { ...p, cover: coveredIn(box.current) });
    if (!onPointer) return;
    if (!p) return onPointer(null);
    const at = p.stops.length ? placeTime(visits.filter((v) => p.stops.includes(v.id)), blocks, activities, day, { visits, points, trips }) : null;
    const spans = [
      ...trips.filter((t) => p.trips.includes(t.key)).map((t) => ({ start: t.start, end: t.end })),
      // A place: each thing you tracked there, and each untracked stretch, outlined on its own.
      ...(at ? [...at.tracked.flatMap((t) => t.spans), ...at.untracked.filter((u) => u.end - u.start >= 60_000)] : []),
    ];
    onPointer(spans);
  };
  const where = (e: { clientX: number; clientY: number }) => {
    const r = box.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: 0, y: 0 };
  };
  // Where you are now (today only): the stop you haven't left, if it's the latest thing the phone
  // knows; otherwise the last dot.
  const here = useMemo(() => {
    if (!liveColor) return null;
    const last = points.length ? points[points.length - 1] : null;
    const open = [...visits].reverse().find((v) => !v.departed_at);
    // (Indoors the phone's dots drift a block or two away while you sit still, so a newer dot
    // only moves you off the stop once the last two are both clearly away from it.)
    const away = (p: RoutePoint) =>
      +new Date(p.at) > +new Date(open!.arrived_at) &&
      !nearOutline(open!.outline, p.lat, p.lng, 0) &&
      metres(open!, p) > Math.max(200, 2 * (p.accuracy_m ?? 0));
    const left = open && points.length >= 2 && away(points[points.length - 1]) && away(points[points.length - 2]);
    if (open && !left) return { at: { lat: open.lat, lng: open.lng }, when: null };
    return last ? { at: { lat: last.lat, lng: last.lng }, when: last.at } : null;
  }, [liveColor, points, visits]);
  const nothingLit = !pointed && lit !== null && lit.stops.size === 0 && lit.trip.size === 0;
  const dimming = (lit !== null && !nothingLit) || !!pin?.at;
  if (!KEY) {
    return (
      <p className="grid size-full place-items-center px-6 text-center text-sm text-muted">
        Add NEXT_PUBLIC_GOOGLE_MAPS_KEY to show the map.
      </p>
    );
  }

  const all: Spot[] = [...points, ...visits].map((s) => ({ lat: s.lat, lng: s.lng }));
  // Dots recorded inside a stop's building are you inside it: not shown.
  const outdoorDots = points.filter((p) => !visits.some((v) => nearOutline(v.outline, p.lat, p.lng, 0)));

  return (
    <div ref={box} className="relative size-full" onMouseLeave={() => pointed && point(null)}>
    {all.length > 0 && <WholeDay onClick={() => setRefit((n) => n + 1)} />}
    <APIProvider apiKey={KEY}>
      <Map
        styles={stylesFor(zoom)}
        onZoomChanged={(e) => setZoom(e.detail.zoom)}
        defaultCenter={all[0] ?? { lat: 43.0731, lng: -89.4012 }}
        defaultZoom={15}
        gestureHandling={gestures}
        disableDefaultUI
        clickableIcons={false}
        draggableCursor={moving ? "crosshair" : undefined}
        onClick={(e) => {
          const at = e.detail.latLng;
          if (!moving) {
            // Clicked a trip: its menu (the untracked one first, where paths overlap).
            const under = pointed ? trips.filter((x) => pointed.trips.includes(x.key)) : [];
            const t = under.find((x) => tripRow(x, blocks, activities, tz).untracked) ?? under[0];
            setReportText("");
            setStars(0);
            // (Not enough room above the click, under the bars over the map: it opens below it.)
            const below = !!pointed && pointed.y - coveredIn(box.current) < 190;
            setAdding(t && pointed ? { trip: t, x: pointed.x, y: pointed.y, below, untracked: tripRow(t, blocks, activities, tz).untracked ?? false } : null);
            return;
          }
          if (!at) return;
          const v = moving;
          setMoving(null);
          runMove(async () => {
            const res = await moveStop(v.id, at.lat, at.lng);
            setMoveNote(res.ok ? null : res.message);
            if (res.ok && v.placeId) lookedUp.delete(v.placeId); // (its building is looked up again at the new spot)
          });
        }}
        className="size-full"
      >
        <FitTo spots={all} top={topCover} again={refit} />
        <PointerTrack trips={trips} onHit={(hit, e) => point(hit.length ? { trips: hit, stops: [], ...where(e) } : null)} />
        {showDots && <Dots points={outdoorDots} tz={tz} />}
        {/* The building you were in, lit up while you hover the stop (here or on the day bar). */}
        {visits.map((v) => (v.outline && lit?.stops.has(v.id) ? <Building key={`b-${v.id}`} outline={v.outline} /> : null))}
        {trips.map((t) => {
          const on = lit?.trip.has(t.key) ?? false;
          return (
            <TripLine key={t.key} pieces={t.pieces} lit={on} faded={dimming && !on} />
          );
        })}
        {/* Loose ends: where a trip begins or ends away from any stop (where the phone started or
            stopped recording, or where you are now). Hover for when. */}
        {trips.flatMap((t) => {
          const ends: { at: Spot; label: string }[] = [];
          if (t.looseStart) ends.push({ at: t.looseStart, label: `Recording picks up here · ${clock(new Date(t.start), tz)}` });
          if (t.looseEnd) ends.push({ at: t.looseEnd, label: `Last recorded here · ${clock(new Date(t.end), tz)}` });
          return ends.map(({ at, label }, i) => (
            <HtmlMarker key={`${t.key}-${i}`} position={at} zIndex={0}>
              <span
                title={label}
                aria-label={label}
                className={`block size-3 cursor-default rounded-full border-2 border-[#faf6f0] bg-[#7f5539] shadow transition-opacity ${
                  dimming && !lit?.trip.has(t.key) ? "opacity-35" : ""
                }`}
              />
            </HtmlMarker>
          ));
        })}
        {/* Where you waited for a ride (a bus stop): a small stop sign on the route. */}
        {trips.flatMap((t) =>
          t.waits.map((w, i) => {
            const label = `Waited here ${span(w.end - w.start)} · ${clock(new Date(w.start), tz)} – ${clock(new Date(w.end), tz)}`;
            return (
              <HtmlMarker key={`${t.key}-wait-${i}`} position={w.at} zIndex={2}>
                <span
                  title={label}
                  aria-label={label}
                  className={`grid size-[18px] cursor-default place-items-center rounded-[6px] border-2 border-[#faf6f0] bg-[#3e281b] shadow transition-opacity ${
                    dimming && !lit?.trip.has(t.key) ? "opacity-35" : ""
                  }`}
                >
                  <span className="block size-1.5 rounded-full bg-[#faf6f0]" />
                </span>
              </HtmlMarker>
            );
          }),
        )}
        {pin?.at && (
          <HtmlMarker position={pin.at} zIndex={6} passive>
            <span className="pointer-events-none flex flex-col items-center" style={{ transform: "translateY(-50%)" }}>
              <span className="mb-1 max-w-[14rem] truncate whitespace-nowrap rounded-full bg-[#3e281b] px-2.5 py-1 text-xs font-semibold text-[#faf6f0] shadow-md">
                {pin.title || "Planned"}
              </span>
              <span className="relative grid size-6 place-items-center">
                <span className="absolute inline-flex size-6 animate-ping rounded-full bg-[#d4a373] opacity-40" />
                <span className="relative size-4 rounded-full border-2 border-dashed border-[#3e281b] bg-[#faf6f0] shadow" />
              </span>
            </span>
          </HtmlMarker>
        )}
        {pin?.at && <ShowSpot at={pin.at} />}
        {here && liveColor && (
          <HtmlMarker position={here.at} zIndex={here.when ? 4 : 0} passive>
            <span className="pointer-events-none relative grid size-4 place-items-center">
              <span className="absolute inline-flex size-4 animate-ping rounded-full opacity-50" style={{ background: liveColor }} />
              {here.when && <span className="relative size-3.5 rounded-full border-2 border-[#faf6f0] shadow" style={{ background: liveColor }} />}
            </span>
          </HtmlMarker>
        )}
        {visits.map((v) => {
          const name = v.place ?? v.auto_name;
          const on = lit?.stops.has(v.id) ?? false;
          const dim = dimming && !on;
          const hovered = pointed?.stops.includes(v.id) ?? false; // (its name hides under the bubble's "what you were doing")
          return (
            <HtmlMarker key={v.id} position={{ lat: v.lat, lng: v.lng }} zIndex={on ? 3 : 1}>
              <button
                type="button"
                // Clicking it: its box opens, and the hover bubble goes (it was in the way of the box).
                onClick={() => {
                  point(null);
                  setOpen(v);
                }}
                onMouseEnter={(e) => open?.id !== v.id && point({ trips: [], stops: samePlace(visits, v).map((x) => x.id), ...where(e) })}
                onMouseLeave={() => point(null)}
                aria-label={name ?? "Unnamed stop"}
                className={`flex cursor-pointer flex-col items-center transition-[opacity,transform] duration-150 ${dim ? "opacity-35" : ""} ${on ? "scale-125" : ""}`}
                style={{ transformOrigin: "bottom center" }}
              >
                {name && (
                  <span
                    className={`mb-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm ${
                      v.place ? "bg-[#3e281b] text-[#faf6f0]" : "bg-[#faf6f0] text-[#3e281b] ring-1 ring-[#3e281b]/30"
                    } ${hovered ? "invisible" : ""}`}
                  >
                    {name}
                  </span>
                )}
                <span
                  className={`block size-4 rounded-full border-2 border-[#3e281b] shadow ${v.place ? "bg-[#faf6f0]" : "bg-[#d4a373]"} ${
                    on ? "ring-4 ring-[#d4a373]/60" : ""
                  }`}
                />
              </button>
            </HtmlMarker>
          );
        })}
        {open && (
          <InfoWindow position={{ lat: open.lat, lng: open.lng }} pixelOffset={[0, -28]} onCloseClick={() => setOpen(null)} headerDisabled>
            <KeepInView>
              <NameStop
                key={open.id}
                visit={open}
                onDone={() => setOpen(null)}
                onMove={() => {
                  setMoving(open);
                  setOpen(null);
                }}
              />
            </KeepInView>
          </InfoWindow>
        )}
      </Map>
      {moving && (
        <div className="absolute inset-x-3 top-3 flex items-center justify-between gap-3 rounded-control bg-accent px-3 py-2 text-sm text-accent-ink shadow-lg">
          <span>Click where {moving.place ?? moving.auto_name ?? "this stop"} really is</span>
          <button type="button" onClick={() => setMoving(null)} className="rounded-control px-2 py-0.5 font-semibold hover:bg-accent-ink/10">
            Cancel
          </button>
        </div>
      )}
      {moveNote && <p className="absolute inset-x-3 top-3 rounded-control bg-paper px-3 py-2 text-sm text-danger shadow">{moveNote}</p>}
      {pin && !pin.at && !moving && (
        <p className="pointer-events-none absolute left-3 top-3 rounded-full bg-paper/95 px-3 py-1 text-xs text-muted shadow-sm ring-1 ring-line">
          {pin.location ? `Not sure where “${pin.location.split(",")[0]}” is` : "No place set for this plan"}
        </p>
      )}
      {nothingLit && !moving && !pin && (
        <p className="pointer-events-none absolute left-3 top-3 rounded-full bg-paper/95 px-3 py-1 text-xs text-muted shadow-sm ring-1 ring-line">
          {focus?.kind === "moving" ? "No route recorded then" : "No location recorded then"}
        </p>
      )}
      <BuildingNote status={buildings} needsSql={visits.some((v) => v.place && !v.placeId)} />
    </APIProvider>
      {adding && (
        <div
          className={`absolute z-40 w-max -translate-x-1/2 rounded-card bg-paper p-1.5 text-sm shadow-xl shadow-ink/20 ring-1 ring-line ${adding.below ? "" : "-translate-y-full"}`}
          style={{ left: adding.x, top: adding.below ? adding.y + 14 : adding.y - 12 }}
        >
          {adding.report === "sent" ? (
            <p className="px-3 py-1.5 text-ink">
              {stars >= 4 ? "Saved. Trips like this one are drawn this way now, when their dots fit." : "Saved. Thanks: this one\u2019s a test case now."}
            </p>
          ) : adding.report === "writing" ? (
            <form
              className="flex w-[min(22rem,80vw)] flex-col gap-1.5 p-1"
              onSubmit={(e) => {
                e.preventDefault();
                const t = adding.trip;
                runAdd(async () => {
                  const res = await reportRoute({
                    start: t.start,
                    end: t.end,
                    fromId: t.fromId,
                    toId: t.toId,
                    note: reportText,
                    stars,
                    drawn: t.pieces.map((p) => p.path),
                    dots: points
                      .filter((p) => +new Date(p.at) >= t.start - 60_000 && +new Date(p.at) <= t.end + 60_000)
                      .map((p) => [p.at, p.lat, p.lng, p.accuracy_m ?? null, p.speed_mps ?? null] as [string, number, number, number | null, number | null]),
                    legs: t.pieces.flatMap((p) => (p.dots ? splitLegs(p.dots).map((l) => ({ mode: l.mode, start: l.start, end: l.end })) : [{ mode: "missing", start: t.start, end: t.end }])),
                    version: PATH_ENGINE,
                  });
                  if (res.ok) {
                    forgetPieces();
                    setAdding((a) => (a ? { ...a, report: "sent", note: undefined } : a));
                    setTimeout(() => setAdding((a) => (a?.report === "sent" ? null : a)), 1600);
                  } else setAdding((a) => (a ? { ...a, note: res.message } : a));
                });
              }}
            >
              <div className="flex items-center gap-0.5 px-0.5" role="radiogroup" aria-label="How right is this route?">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={stars === n}
                    aria-label={`${n} star${n > 1 ? "s" : ""}`}
                    onClick={() => setStars(n)}
                    className={`grid size-8 place-items-center rounded-control text-xl leading-none hover:bg-surface ${n <= stars ? "text-accent" : "text-line"}`}
                  >
                    ★
                  </button>
                ))}
                <span className="ml-2 text-xs text-muted">{["How right is this route?", "Way off", "Mostly wrong", "Close", "Right", "Exactly right"][stars]}</span>
              </div>
              <label className="px-1 text-xs font-semibold text-muted" htmlFor="route-report">
                {stars && stars <= 3 ? "What\u2019s wrong with it? (optional)" : "Anything to add? (optional)"}
              </label>
              <textarea
                id="route-report"
                autoFocus
                rows={3}
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                placeholder="I went up Lake St, not through the building…"
                className="w-full resize-none rounded-control border border-line bg-paper px-2.5 py-2 text-sm outline-none focus:border-ink"
              />
              <div className="flex justify-end gap-1">
                <button type="button" onClick={() => setAdding(null)} className="rounded-control px-2 py-1.5 text-muted hover:bg-surface">
                  Cancel
                </button>
                <button type="submit" disabled={addPending || !stars} className="rounded-control bg-accent px-3 py-1.5 font-semibold text-accent-ink disabled:opacity-60">
                  {addPending ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          ) : (
            <>
              {adding.untracked && (
                <button
                  type="button"
                  disabled={addPending}
                  onClick={() =>
                    runAdd(async () => {
                      const res = await saveBlock({ name: "Commute", start: new Date(adding.trip.start).toISOString(), end: new Date(adding.trip.end).toISOString() });
                      if (res.ok) setAdding(null);
                      else setAdding((a) => (a ? { ...a, note: res.message } : a));
                    })
                  }
                  className="rounded-control px-3 py-1.5 font-semibold text-ink hover:bg-surface"
                >
                  {addPending ? "Adding…" : `Add as Commute · ${clock(new Date(adding.trip.start), tz)} – ${clock(new Date(adding.trip.end), tz)}`}
                </button>
              )}
              <button type="button" onClick={() => setAdding((a) => (a ? { ...a, report: "writing", note: undefined } : a))} className="rounded-control px-3 py-1.5 text-ink hover:bg-surface">
                Rate this route
              </button>
              <button type="button" onClick={() => setAdding(null)} className="rounded-control px-2 py-1.5 text-muted hover:bg-surface">
                Cancel
              </button>
            </>
          )}
          {adding.note && <p className="px-3 pb-1 text-xs text-danger">{adding.note}</p>}
        </div>
      )}
      {pointed && !moving && !adding && (
        <Tip
          x={pointed.x}
          y={pointed.y}
          cover={pointed.cover ?? 0}
          heading={!pointed.stops.length && pointed.trips.length > 1 ? `${pointed.trips.length} trips here` : undefined}
          rows={[
            ...trips.filter((t) => pointed.trips.includes(t.key)).map((t) => tripRow(t, blocks, activities, tz)),
            ...(pointed.stops.length ? stopRows(visits.filter((v) => pointed.stops.includes(v.id)), blocks, activities, day, { visits, points, trips }) : []),
          ]}
        />
      )}
    </div>
  );
}

type Row = { key: string; color: string; title: string; detail: string; untracked?: boolean };

// A trip, named after the moving entry during it (Commute, or later Running…). Never after a
// still one like a class: if no moving entry covers it, it's just a trip nothing was tracked for.
function tripRow(t: Trip, blocks: Block[], activities: Activity[], tz: string): Row {
  let best: Activity | undefined;
  let most = 0;
  for (const b of blocks) {
    const a = b.activity_id ? activities.find((x) => x.id === b.activity_id) : undefined;
    if (!a || !isMoving(a.name)) continue;
    const o = Math.min(t.end, b.ended_at ? +new Date(b.ended_at) : Date.now()) - Math.max(t.start, +new Date(b.started_at));
    if (o > most) [best, most] = [a, o];
  }
  return {
    key: t.key,
    color: best?.color ?? "#7f5539",
    title: best?.name ?? "Trip (no Commute tracked) · click to add",
    detail: `${clock(new Date(t.start), tz)} – ${clock(new Date(t.end), tz)} · ${span(t.end - t.start)}`,
    untracked: !best,
  };
}

// Hovering a stop: what you were doing there (its name is already on the map), and when.
type Span = { start: number; end: number };

// Overlapping stretches joined into one (so two entries for the same time don't count twice).
function union(spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const sp of [...spans].sort((a, b) => a.start - b.start)) {
    const last = out[out.length - 1];
    if (last && sp.start <= last.end) last.end = Math.max(last.end, sp.end);
    else out.push({ ...sp });
  }
  return out;
}
const total = (spans: Span[]) => spans.reduce((n, sp) => n + sp.end - sp.start, 0);

// Your time at a place today, split the way the day bar shows it: each thing you tracked there
// (longest first), and "Untracked" for the rest. Only within this day, and never past now.
type Around = { visits: Visit[]; points: RoutePoint[]; trips: Trip[] };

function placeTime(group: Visit[], blocks: Block[], activities: Activity[], day: Span | null, around?: Around) {
  const lo = day?.start ?? -Infinity;
  const hi = Math.min(day?.end ?? Infinity, Date.now());
  const ids = new Set(group.map((v) => v.id));
  const there = union(
    group
      .map((v) => {
        const start = Math.max(lo, +new Date(v.arrived_at));
        let end = Math.min(hi, v.departed_at ? +new Date(v.departed_at) : Date.now());
        // A stop the phone ended because it stopped recording (the app was off, no dots at all
        // after it): you were still there until you're next seen moving or somewhere else.
        if (around && v.departed_at) {
          const next = Math.min(
            hi,
            ...around.visits.filter((o) => !ids.has(o.id) && +new Date(o.arrived_at) >= end).map((o) => +new Date(o.arrived_at)),
            ...around.trips.filter((t) => t.start >= end - 60_000).map((t) => t.start),
          );
          const dotsBetween = around.points.some((pt) => {
            const t = +new Date(pt.at);
            return t > end + 60_000 && t < next && metres(pt, v) > 100;
          });
          if (!dotsBetween && next > end && next - end < 3 * 3600_000) end = next;
        }
        return { start, end };
      })
      .filter((sp) => sp.end > sp.start),
  );
  const byId = new globalThis.Map(activities.map((a) => [a.id, a]));
  const each = new globalThis.Map<string, Span[]>();
  for (const b of blocks) {
    if (b.source === "location" || !b.activity_id) continue;
    const a = byId.get(b.activity_id);
    if (!a || a.name === "Commute") continue;
    const bs = +new Date(b.started_at);
    const be = b.ended_at ? +new Date(b.ended_at) : Date.now();
    for (const sp of there) {
      const start = Math.max(sp.start, bs);
      const end = Math.min(sp.end, be);
      if (end > start) each.set(a.id, [...(each.get(a.id) ?? []), { start, end }]);
    }
  }
  const tracked = [...each.entries()]
    .map(([id, spans]) => ({ activity: byId.get(id)!, spans: union(spans) }))
    .map((t) => ({ ...t, ms: total(t.spans) }))
    .filter((t) => t.ms >= 60_000)
    .sort((a, b) => b.ms - a.ms);
  // Untracked: your time there minus everything tracked.
  const covered = union(tracked.flatMap((t) => t.spans));
  const untracked: Span[] = [];
  for (const sp of there) {
    let at = sp.start;
    for (const c of covered) {
      if (c.end <= at || c.start >= sp.end) continue;
      if (c.start > at) untracked.push({ start: at, end: c.start });
      at = Math.max(at, c.end);
    }
    if (at < sp.end) untracked.push({ start: at, end: sp.end });
  }
  return { tracked, untracked, untrackedMs: total(untracked) };
}

function stopRows(group: Visit[], blocks: Block[], activities: Activity[], day: Span | null, around?: Around): Row[] {
  const { tracked, untrackedMs } = placeTime(group, blocks, activities, day, around);
  const rows: Row[] = tracked.map((t) => ({ key: t.activity.id, color: t.activity.color, title: t.activity.name, detail: span(t.ms) }));
  if (untrackedMs >= 60_000) rows.push({ key: "untracked", color: "#d6cbbd", title: "Untracked", detail: span(untrackedMs) });
  return rows;
}

// Every stop today at the same place as this one, so hovering one shows all your time there:
// the same saved place, or (when one of them isn't matched to a place yet, like the stop you're
// at right now) inside the same building, right next to it, or the same name close by.
function samePlace(visits: Visit[], v: Visit): Visit[] {
  const name = v.place ?? v.auto_name;
  const dist = (a: Visit) => Math.hypot((a.lat - v.lat) * 111_000, (a.lng - v.lng) * 111_000 * Math.cos((v.lat * Math.PI) / 180));
  return visits.filter((a) => {
    if (a.id === v.id) return true;
    if (v.placeId && a.placeId) return a.placeId === v.placeId;
    if (nearOutline(v.outline, a.lat, a.lng) || nearOutline(a.outline, v.lat, v.lng)) return true;
    if (dist(a) < 40) return true;
    return name != null && (a.place ?? a.auto_name) === name && dist(a) < 80;
  });
}

// The little speech bubble by the pointer: everything under it (overlapping paths all listed).
function Tip({ x, y, rows, heading, cover = 0 }: { x: number; y: number; rows: Row[]; heading?: string; cover?: number }) {
  if (!rows.length) return null;
  const below = y - cover < 40 + rows.length * 40; // near the top of what you can see of the map: show it under the pointer instead
  return (
    <div
      role="tooltip"
      className={`pointer-events-none absolute z-30 w-max max-w-64 -translate-x-1/2 rounded-card bg-ink px-3 py-2 text-paper shadow-lg ${below ? "" : "-translate-y-full"}`}
      style={{ left: x, top: below ? y + 18 : y - 14 }}
    >
      {heading && <p className="mb-1 text-[11px] text-paper/60">{heading}</p>}
      <ul className="flex flex-col gap-1">
        {rows.map((r) => (
          <li key={r.key} className="leading-tight">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <span className="size-2 shrink-0 rounded-full ring-1 ring-paper/40" style={{ background: r.color }} />
              {r.title}
            </p>
            <p className="num text-xs text-paper/70">{r.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Which trips are under the pointer (within ~10 px of their line), as it moves over the map.
function PointerTrack({ trips, onHit }: { trips: Trip[]; onHit: (keys: string[], e: { clientX: number; clientY: number }) => void }) {
  const map = useMap();
  const report = useRef(onHit); // the latest callback, without re-listening every render
  useEffect(() => {
    report.current = onHit;
  }, [onHit]);
  useEffect(() => {
    if (!map) return;
    let frame = 0;
    let last = "";
    const move = map.addListener("mousemove", (e: google.maps.MapMouseEvent) => {
      const dom = e.domEvent as MouseEvent | undefined;
      const at = e.latLng;
      if (!dom || !at) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const proj = map.getProjection();
        const zoom = map.getZoom();
        if (!proj || zoom == null) return;
        const k = 2 ** zoom;
        const px = (s: Spot | google.maps.LatLng) => {
          const p = proj.fromLatLngToPoint(s)!;
          return { x: p.x * k, y: p.y * k };
        };
        const c = px(at);
        const near = (a: { x: number; y: number }, b: { x: number; y: number }) => {
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = dx * dx + dy * dy;
          const u = len ? Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / len)) : 0;
          return Math.hypot(a.x + u * dx - c.x, a.y + u * dy - c.y);
        };
        const hit = trips
          .filter((t) =>
            t.pieces.some((p) => {
              let prev = px(p.path[0]);
              for (let i = 1; i < p.path.length; i++) {
                const cur = px(p.path[i]);
                if (near(prev, cur) < 10) return true;
                prev = cur;
              }
              return false;
            }),
          )
          .map((t) => t.key);
        const sig = hit.join("|");
        if (sig === last && !hit.length) return;
        last = sig;
        report.current(hit, dom);
      });
    });
    const out = map.addListener("mouseout", () => {
      cancelAnimationFrame(frame);
      last = "";
    });
    return () => {
      cancelAnimationFrame(frame);
      move.remove();
      out.remove();
    };
  }, [map, trips]);
  return null;
}

// Trips drawn as realistically as we can, piece by piece. Stretches the phone recorded are
// snapped onto the real paths and roads (solid; see snap.ts). Bits it missed are filled in and
// stay dashed: a whole missed trip uses a walk you recorded before between the same two places,
// otherwise Google's walking route. Answers are kept in this browser.
function useFilledTrips(trips: Trip[], points: RoutePoint[]): { trips: Trip[]; settled: boolean } {
  const [better, setBetter] = useState<Record<string, Spot[]>>({});
  const [doneKeys, setDoneKeys] = useState<Set<string>>(() => new Set()); // (pieces worked out, drawn better or not)
  const [guessed, setGuessed] = useState<Set<string>>(() => new Set()); // (recorded pieces with too few dots: filled in, so a guess)
  const asked = useRef(new Set<string>());
  // Your trails around the day (trails.ts), learned from your walks before it. Fetched once per
  // day; the pieces wait for them (a few hundred ms) so they're drawn the learned way first time.
  const [trails, setTrails] = useState<{ day: string; center: ReturnType<typeof makeTrails> } | null>(null);
  const dayOf = points.length ? points[0].at.slice(0, 10) : "";
  useEffect(() => {
    if (!points.length || trails?.day === dayOf) return;
    let lat0 = Infinity, lat1 = -Infinity, lng0 = Infinity, lng1 = -Infinity; // prettier-ignore
    for (const p of points) {
      lat0 = Math.min(lat0, p.lat);
      lat1 = Math.max(lat1, p.lat);
      lng0 = Math.min(lng0, p.lng);
      lng1 = Math.max(lng1, p.lng);
    }
    const pad = 0.002;
    trailCells({ minLat: lat0 - pad, maxLat: lat1 + pad, minLng: lng0 - pad, maxLng: lng1 + pad }, points[0].at)
      .catch(() => [])
      .then((cells) => setTrails({ day: dayOf, center: makeTrails(cells) }));
  }, [points, dayOf, trails?.day]);
  const ready = !points.length || trails?.day === dayOf;
  // (Answers are kept even if the trips change meanwhile: each piece is only asked about once.)
  useEffect(() => {
    if (!ready) return;
    const center = trails?.center ?? null;
    for (const t of trips) {
      t.pieces.forEach(async (p, i) => {
        const key = pieceKey(t, i);
        if (asked.current.has(key)) return;
        asked.current.add(key);
        if (keptPiece(key)) {
          setDoneKeys((d) => new Set(d).add(key));
          return;
        }
        try {
        const a = p.path[0];
        const b = p.path[p.path.length - 1];
        let path: Spot[] | null = null;
        let guessedNow = false;
        // A whole trip between two stops: routes you gave 4-5 stars between their places (055).
        const whole = t.pieces.length === 1 && t.fromId && t.toId;
        const trusted = whole
          ? (await trustedRoutes(t.fromId!, t.toId!).catch(() => [])).map((r) => ({ ...r, line: r.reversed ? [...r.line].reverse() : r.line }))
          : [];
        // Your dots fit one (by their own accuracy, both ways round: routefit.ts): drawn that way.
        const fit = !p.missing && p.dots ? trusted.find((r) => fitsTrusted(p.dots!, r.line, r.spread)) : undefined;
        if (fit) path = [a, ...fit.line.slice(1, -1), b];
        else if (!p.missing) {
          // Only the dots you recorded are snapped, not the stops at either end: snapping to a stop's
          // pin would route you to whatever door the map knows (the library's west entrance) instead
          // of the way you actually went in. The ends join straight from your first / last dot.
          // Leg by leg (walk, bike, ride, waiting at a stop: legs.ts), each matched its own way; a
          // wait is just where you stood, so a bus stop never turns into a detour.
          // (The path is [the stop, the door you left by] + your dots + [the next stop].)
          const head = p.path.slice(0, Math.max(0, p.path.length - (p.dots?.length ?? 0) - (p.ends?.to ? 1 : 0)));
          // Walks are first pulled onto your usual line (your trails), then matched to real paths
          // and sidewalks (snap.ts): GPS beside buildings drifts 15-30 m into them, and a route
          // never goes through a building. Your dots still win where they're far from any path
          // (a real shortcut the map doesn't know). Unmatched (the server can't say): your dots,
          // smoothed when they're good ones.
          const legs = (p.dots ? splitLegs(p.dots) : []).map((l) =>
            center && l.mode === "walk" ? { ...l, dots: center.center(l.dots), known: center.known(l.dots) } : { ...l, known: 0 },
          );
          const drawn = await Promise.all(
            legs.map(async (l) => {
              if (l.mode === "wait") return [waitSpot(l)];
              const asDots = () => l.dots.map((d) => ({ lat: d.lat, lng: d.lng }));
              const matched = await snapLeg(l.dots, l.mode);
              if (matched) return matched;
              return l.mode === "walk" && (l.known >= 0.6 || trustworthy(l.dots)) ? smooth(asDots()) : asDots();
            }),
          );
          const body = despike(drawn.flat());
          // Hardly any dots for a real distance (one or two: the phone barely saw the trip): that's
          // a gap, not a straight line through whatever's between. Filled in like one, below.
          const thin = (p.dots?.length ?? 0) < 3 && metres(a, b) >= 120;
          if (!thin && legs.length && body.length >= 2) {
            // Joined back to where it really starts and ends. A long way from the last dot to the
            // stop (the phone said you'd arrived while you were still walking up): along the
            // paths, not a straight line through whatever's between.
            // (Not when the paths go far round: then the short straight bit is the better guess.)
            const joinTo = async (from: Spot, to: Spot) => {
              if (metres(from, to) <= 40) return [];
              const way = await walkingRoute(from, to).catch(() => null);
              const long = way ? way.slice(1).reduce((t, s, i) => t + metres(way[i], s), 0) : Infinity;
              return way && long <= metres(from, to) * 2.5 + 60 ? way : [];
            };
            const first = head.length ? head[head.length - 1] : null;
            const lead = first && metres(first, body[0]) > 40 ? await joinTo(first, body[0]) : [];
            const tail = p.ends?.to ? await joinTo(body[body.length - 1], b) : [];
            path = [...head, ...lead, ...body, ...tail, ...(p.ends?.to ? [b] : [])];
          }
          if (thin) {
            // (Too few dots to check a trusted route against: still the best guess, dashed.)
            const remembered = trusted[0]?.line.slice(1, -1) ?? (whole ? await rememberedRoute(t.fromId!, t.toId!).catch(() => null) : null);
            const found = remembered ?? (await walkingRoute(a, b));
            if (found) {
              setGuessed((g) => new Set(g).add(key));
              guessedNow = true;
              path = [a, ...found, b];
            }
          }
        } else if (p.missing && metres(a, b) >= 120) {
          const remembered = trusted[0]?.line.slice(1, -1) ?? (whole ? await rememberedRoute(t.fromId!, t.toId!).catch(() => null) : null);
          // (Joined to both ends: the route found starts and ends on the nearest street, which left
          // a little gap to where your dots stop and start again.)
          const found = remembered ?? (await walkingRoute(a, b));
          path = found ? [a, ...found, b] : null;
        }
        if (path && path.length >= 2) setBetter((m) => ({ ...m, [key]: path! }));
        keepPiece(key, path && path.length >= 2 ? path : null, guessedNow);
        } finally {
          setDoneKeys((d) => new Set(d).add(key));
        }
      });
    }
  }, [trips, ready, trails]);
  const filled = useMemo(
    () =>
      trips.map((t) => {
        const pieces = t.pieces.map((p, i) => {
          const k = pieceKey(t, i);
          const kept = better[k] ? undefined : keptPiece(k);
          if (kept?.path) return { ...p, path: kept.path, ...(kept.guess ? { missing: true } : {}) };
          if (!better[k]) return (p.dots?.length ?? 0) < 3 && !p.missing && p.path.length >= 2 && metres(p.path[0], p.path[p.path.length - 1]) >= 120 ? { ...p, missing: true } : p;
          return { ...p, path: better[k], ...(guessed.has(k) ? { missing: true } : {}) };
        });
        // A missed bit runs from where the piece before it is drawn to end, to where the next one
        // is drawn to start (those were snapped or pulled onto your path, so they're not quite at
        // the raw dots any more): no little gaps where they meet.
        return {
          ...t,
          pieces: pieces.map((p, i) => {
            if (!p.missing || p.path.length < 2) return p;
            const before = pieces[i - 1]?.path;
            const after = pieces[i + 1]?.path;
            const path = [...p.path];
            if (before?.length) path[0] = before[before.length - 1];
            if (after?.length) path[path.length - 1] = after[0];
            return { ...p, path };
          }),
        };
      }),
    [trips, better, guessed],
  );
  // Every piece worked out (for saving a finished day's routes).
  const settled = trips.every((t) => t.pieces.every((_, i) => doneKeys.has(pieceKey(t, i)) || !!keptPiece(pieceKey(t, i)))) && (ready || trips.every((t) => t.pieces.every((_, i) => !!keptPiece(pieceKey(t, i)))));
  return { trips: filled, settled };
}

// A piece's finished drawing, kept in this browser: a reload draws it straight away instead of
// wiggly dots that snap into place a moment later. Keyed by the piece (what it covers) and the
// way routes are drawn (PATH_ENGINE): a changed trip or a new engine works it out again.
// "none": worked out, nothing better than the dots. Rating a route clears them all (a trusted
// route can change how other trips between those places are drawn).
type KeptPiece = { path: Spot[] | null; guess: boolean };
const keptId = (k: string) => `mbm-piece:${PATH_ENGINE}:${k}`;
function keptPiece(k: string): KeptPiece | undefined {
  try {
    const v = localStorage.getItem(keptId(k));
    if (!v) return undefined;
    if (v === "none") return { path: null, guess: false };
    const guess = v.startsWith("g:");
    return { path: decodePolyline(guess ? v.slice(2) : v, 6), guess };
  } catch {
    return undefined;
  }
}
function keepPiece(k: string, path: Spot[] | null, guess: boolean) {
  try {
    // (Finished days are saved with the day itself: these only matter for days still going. A
    // lot of them piled up: start over rather than fill the browser's storage.)
    let n = 0;
    for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i)?.startsWith("mbm-piece:")) n++;
    if (n > 1500) forgetPieces();
    localStorage.setItem(keptId(k), path ? (guess ? "g:" : "") + encodePolyline(path, 6) : "none");
  } catch {}
}
function forgetPieces() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith("mbm-piece:")) localStorage.removeItem(k);
    }
  } catch {}
}

// A piece, by what it covers (so a changed trip asks again only for pieces that changed).
const pieceKey = (t: Trip, i: number) => {
  const p = t.pieces[i].path;
  const f = (s: Spot) => `${s.lat.toFixed(5)},${s.lng.toFixed(5)}`;
  return `${t.key}:${p.length}:${f(p[0])}:${f(p[p.length - 1])}:${t.pieces[i].missing ? "m" : "r"}`;
};

// Google's walking route between two spots (Routes API; it has to be allowed on the key).
async function walkingRoute(a: Spot, b: Spot): Promise<Spot[] | null> {
  const id = `mbm-walk:${a.lat.toFixed(4)},${a.lng.toFixed(4)}>${b.lat.toFixed(4)},${b.lng.toFixed(4)}`;
  try {
    const kept = localStorage.getItem(id);
    if (kept) return JSON.parse(kept) as Spot[];
  } catch {}
  try {
    const at = (s: Spot) => ({ location: { latLng: { latitude: s.lat, longitude: s.lng } } });
    const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": KEY!, "X-Goog-FieldMask": "routes.polyline.encodedPolyline" },
      body: JSON.stringify({ origin: at(a), destination: at(b), travelMode: "WALK" }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { routes?: { polyline?: { encodedPolyline?: string } }[] };
    const line = body.routes?.[0]?.polyline?.encodedPolyline;
    if (!line) return null;
    const path = [a, ...decodePolyline(line), b];
    try {
      localStorage.setItem(id, JSON.stringify(path));
    } catch {}
    return path;
  } catch {
    return null;
  }
}

// A trip: solid mocha where the phone recorded the way, dashed only where the way is really a
// guess. Lit = the hovered stretch (thicker, caramel); faded = the rest of the day while hovering.
function TripLine({ pieces, lit, faded }: { pieces: Piece[]; lit: boolean; faded: boolean }) {
  return pieces.map((p, i) => <Route key={i} path={p.path} dashed={p.missing && !plainly(p.path)} lit={lit} faded={faded} />);
}

// A bit the phone missed, but where there's no real doubt which way you went (a wait at a bus
// stop, a few blocks along one street): drawn solid like the rest. It counts as plain when it's
// short (150 m or less), or when the way filled in for it is under a kilometre and barely longer
// than a straight line (one obvious route, no turns to guess). Anything longer or twistier stays
// dashed.
function plainly(path: Spot[]): boolean {
  if (path.length < 2) return true;
  const straight = metres(path[0], path[path.length - 1]);
  if (straight <= 150) return true;
  if (path.length === 2) return false; // (a straight line drawn for want of anything better)
  let along = 0;
  for (let i = 1; i < path.length; i++) along += metres(path[i - 1], path[i]);
  return along <= 1000 && along <= straight * 1.3 + 40;
}

function Route({ path, dashed, lit, faded }: { path: Spot[]; dashed: boolean; lit: boolean; faded: boolean }) {
  const map = useMap();
  const maps = useMapsLibrary("maps");
  useEffect(() => {
    if (!map || !maps) return;
    const color = lit ? "#d4a373" : "#7f5539";
    const opacity = lit ? 1 : faded ? 0.3 : 0.85;
    const weight = lit ? 7 : 4;
    const line = new maps.Polyline({
      path,
      map,
      clickable: false,
      strokeColor: color,
      strokeWeight: weight,
      zIndex: lit ? 2 : 1,
      // Dashed: no line, just a repeating dash along it.
      strokeOpacity: dashed ? 0 : opacity,
      icons: dashed
        ? [{ icon: { path: "M 0,-1 0,1", strokeColor: color, strokeOpacity: opacity, strokeWeight: weight - 1, scale: 3 }, offset: "0", repeat: "14px" }]
        : undefined,
    });
    return () => line.setMap(null);
  }, [map, maps, path, dashed, lit, faded]);
  return null;
}

// A building's outline, filled in.
function Building({ outline }: { outline: [number, number][] }) {
  const map = useMap();
  const maps = useMapsLibrary("maps");
  useEffect(() => {
    if (!map || !maps) return;
    const shape = new maps.Polygon({
      map,
      paths: outline.map(([lat, lng]) => ({ lat, lng })),
      strokeColor: "#3e281b",
      strokeOpacity: 0.9,
      strokeWeight: 2,
      fillColor: "#d4a373",
      fillOpacity: 0.45,
      clickable: false,
      zIndex: 0,
    });
    return () => shape.setMap(null);
  }, [map, maps, outline]);
  return null;
}

// Every recorded dot, small, with its time on hover (one map layer, so thousands are fine).
function Dots({ points, tz }: { points: RoutePoint[]; tz: string }) {
  const map = useMap();
  const maps = useMapsLibrary("maps");
  useEffect(() => {
    if (!map || !maps) return;
    const layer = new maps.Data({ map });
    for (const p of points) {
      const acc = p.accuracy_m != null ? ` · ±${Math.round(p.accuracy_m)} m` : "";
      layer.add({ geometry: { lat: p.lat, lng: p.lng }, properties: { title: `${clock(p.at, tz)}${acc}` } });
    }
    layer.setStyle((f) => ({
      title: String(f.getProperty("title")),
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 3, fillColor: "#3e281b", fillOpacity: 0.9, strokeColor: "#faf6f0", strokeWeight: 1 },
      zIndex: 3,
    }));
    return () => layer.setMap(null);
  }, [map, maps, points, tz]);
  return null;
}

// Your places' buildings: looked up (OpenStreetMap) for any place that doesn't have one yet, one
// at a time in the background, and saved: from this browser, or the website's server if the
// browser can't get through. Then a stop is "at" a place when it's in that building, however
// big; the next phone sync redoes the day that way. Each place is looked up once per visit to
// the page (it keeps going even when the page refreshes itself).
const lookedUp = new Set<string>();
type BuildingStatus = { looking: number; found: number; none: number; busy: number; problem?: string };

function usePlaceBuildings(visits: Visit[]): BuildingStatus | null {
  const router = useRouter();
  const [status, setStatus] = useState<BuildingStatus | null>(null);
  useEffect(() => {
    const todo = new globalThis.Map<string, { lat: number; lng: number }>(); // (Map here is the map component)
    for (const v of visits) if (v.placeId && v.placeNeedsOutline && !lookedUp.has(v.placeId)) todo.set(v.placeId, { lat: v.lat, lng: v.lng });
    // Unnamed stops of 8 minutes or more get their building too (once: it's saved), up to 12 a day.
    const stops = new globalThis.Map<string, { lat: number; lng: number }>();
    for (const v of visits) {
      const long = (v.departed_at ? +new Date(v.departed_at) : Date.now()) - +new Date(v.arrived_at) >= 8 * 60_000;
      if (!v.placeId && v.stopNeedsOutline && long && !lookedUp.has(`stop:${v.id}`) && stops.size < 12) stops.set(v.id, { lat: v.lat, lng: v.lng });
    }
    for (const id of stops.keys()) lookedUp.add(`stop:${id}`);
    if (stops.size)
      (async () => {
        let saved = false;
        for (const [id, at] of stops) {
          const outline = await buildingAt(at.lat, at.lng).catch(() => undefined);
          if (outline === undefined) lookedUp.delete(`stop:${id}`); // (couldn't reach it: next time)
          else if ((await setStopOutline(id, outline).catch(() => ({ ok: false }))).ok && outline) saved = true;
          await new Promise((r) => setTimeout(r, 1200));
        }
        if (saved) router.refresh();
      })();
    if (!todo.size) return;
    for (const id of todo.keys()) lookedUp.add(id);
    (async () => {
      await Promise.resolve();
      setStatus((s) => ({ found: 0, none: 0, busy: 0, ...s, looking: (s?.looking ?? 0) + todo.size }));
      let saved = false;
      for (const [id, at] of todo) {
        let result: string = "busy";
        const outline = await buildingAt(at.lat, at.lng, undefined, 45).catch(() => undefined);
        if (outline !== undefined) {
          const res = await setPlaceOutline(id, outline).catch((e: Error) => ({ ok: false as const, message: e.message }));
          result = res.ok ? (outline ? "found" : "none") : res.message;
        } else {
          result = await lookupPlaceOutline(id, at.lat, at.lng).catch(() => "busy"); // (try from the server)
        }
        if (result === "found") saved = true;
        if (result === "busy") lookedUp.delete(id); // (try again next time)
        setStatus((s) => {
          const n = { found: 0, none: 0, busy: 0, looking: 1, ...s };
          n.looking = Math.max(0, n.looking - 1);
          if (result === "found") n.found++;
          else if (result === "none") n.none++;
          else if (result === "busy") n.busy++;
          else n.problem = result;
          return n;
        });
        await new Promise((r) => setTimeout(r, 1200));
      }
      if (saved) router.refresh();
    })();
  }, [visits, router]);
  return status;
}

// A small note on the map while buildings are being looked up (and if it couldn't).
function BuildingNote({ status, needsSql }: { status: BuildingStatus | null; needsSql: boolean }) {
  if (needsSql) status = { looking: 0, found: 0, none: 0, busy: 0, problem: "Buildings are off: run 032_places_by_building.sql in Supabase." };
  if (!status) return null;
  const text = status.problem
    ? status.problem
    : status.looking
      ? `Finding your places' buildings… (${status.found + status.none + status.busy} of ${status.found + status.none + status.busy + status.looking})`
      : status.busy
        ? "Couldn't reach OpenStreetMap for some buildings: it'll try again next time."
        : status.found
          ? `Found ${status.found} building${status.found === 1 ? "" : "s"}.`
          : null;
  if (!text) return null;
  return <div className="pointer-events-none absolute bottom-8 left-1/2 z-10 max-w-[80%] -translate-x-1/2 rounded-control bg-paper/95 px-3 py-1.5 text-xs text-ink shadow ring-1 ring-line">{text}</div>;
}

// Zooms to show the whole day: when the day opens (not every time new dots come in from the
// phone, so the map doesn't jump while you look around).
function FitTo({ spots, top = 0, again = 0 }: { spots: Spot[]; top?: number; again?: number }) {
  const map = useMap();
  const core = useMapsLibrary("core");
  const key = spots.length ? `${spots[0].lat},${spots[0].lng}` : "";
  useEffect(() => {
    if (!map || !core || spots.length === 0) return;
    if (spots.length === 1) {
      map.setCenter(spots[0]);
      map.setZoom(17);
      return;
    }
    const bounds = new core.LatLngBounds();
    for (const s of spots) bounds.extend(s);
    map.fitBounds(bounds, top ? { top: top + 32, right: 48, bottom: 48, left: 48 } : 48);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only for a new day (or a new cover)
  }, [map, core, key, top, again]);
  return null;
}

// A planned spot off the edge of the map: moved into view (only when it's off screen, so the map
// doesn't jump about while you hover along the bar).
function ShowSpot({ at }: { at: Spot }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const b = map.getBounds();
    if (b && !b.contains(at)) map.panTo(at);
  }, [map, at]);
  return null;
}

// Back to the whole day (in the corner where the zoom buttons were).
function WholeDay({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Show the whole day"
      className="absolute bottom-4 right-4 z-10 flex items-center gap-2 rounded-full bg-paper/95 px-3.5 py-2 text-sm font-semibold text-ink shadow-lg shadow-ink/15 ring-1 ring-line backdrop-blur transition-colors hover:bg-surface"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Whole day
    </button>
  );
}

// (Google's popup pads only its left side; the extra right padding below evens it out.)
function NameStop({ visit, onDone, onMove }: { visit: Visit; onDone: () => void; onMove: () => void }) {
  // Your name for it (top), and the actual place it's linked to (below). Without your own name,
  // the actual place's name is what shows.
  const legacy = visit.placeReal === undefined; // (047 not run yet: just a name)
  const startOwn = visit.placeOwn ?? (visit.placeReal ? "" : (visit.place ?? (legacy ? (visit.auto_name ?? "") : "")));
  const [own, setOwn] = useState(startOwn);
  const [real, setReal] = useState<Found | null>(null);
  const [searching, setSearching] = useState(!legacy && !visit.placeReal);
  const [places, setPlaces] = useState<PlaceLite[]>([]);
  const confirm = useConfirm();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, run] = useTransition();
  useEffect(() => {
    if (legacy) return;
    let live = true;
    myPlaces().then((p) => live && setPlaces(p));
    return () => {
      live = false;
    };
  }, [legacy]);
  const linked = real ? { name: real.label, address: real.detail } : (visit.placeReal ?? null);
  const changed = own.trim() !== startOwn.trim() || !!real;
  const save = () => {
    setMessage(null);
    run(async () => {
      const pick: PlacePick | null = real ?? (visit.placeId ? { kind: "mine", id: visit.placeId } : null);
      const res = await setStopPlace(visit.id, own.trim() !== startOwn.trim() || real ? own : null, pick);
      if (res.ok) onDone();
      else setMessage(res.message);
    });
  };
  const label = "text-[11px] font-semibold text-[#86705f]";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex w-72 flex-col gap-2 p-1 pr-4 font-sans"
    >
      <p className={label}>{legacy ? (!visit.place && visit.auto_name ? "Name found by your phone" : "Name") : "Your name for it"}</p>
      <input
        value={own}
        onChange={(e) => setOwn(e.target.value)}
        placeholder={linked ? `Optional (else “${linked.name}”)` : "Home, Theory… (optional)"}
        maxLength={80}
        autoFocus={!searching}
        className="rounded-[10px] border border-[#e2d5c4] bg-[#faf6f0] px-2.5 py-2 text-sm text-[#2b1c14] outline-none focus:border-[#2b1c14]"
      />
      {!legacy && (
        <>
          <p className={`${label} mt-1`}>Actual place</p>
          {linked && !searching ? (
            <div className="flex items-start gap-2 rounded-[10px] bg-[#f0e7db] px-2.5 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[#2b1c14]">{linked.name}</span>
                {linked.address && <span className="block truncate text-xs text-[#86705f]">{linked.address}</span>}
              </span>
              <button type="button" onClick={() => setSearching(true)} className="shrink-0 text-xs font-semibold text-[#3e281b] underline underline-offset-2">
                Change
              </button>
            </div>
          ) : (
            <>
              {!linked && visit.auto_name && <p className="-mt-1 text-xs text-[#86705f]">Your phone guessed this. Not right? Search for where you were.</p>}
              <PlaceSearch
                places={places}
                initial={linked ? "" : (visit.auto_name ?? "")}
                near={{ lat: visit.lat, lng: visit.lng }}
                autoFocus
                placeholder="Search: Pres House, Target…"
                inputClassName="w-full rounded-[10px] border border-[#e2d5c4] bg-[#faf6f0] px-2.5 py-2 text-sm text-[#2b1c14] focus:border-[#2b1c14]"
                onPick={(p) => {
                  setReal(p);
                  setSearching(false);
                }}
              />
              {linked && (
                <button type="button" onClick={() => setSearching(false)} className="self-start text-xs text-[#86705f] underline underline-offset-2">
                  Keep {linked.name}
                </button>
              )}
            </>
          )}
        </>
      )}
      <div className="mt-1 flex gap-2">
        <button type="submit" disabled={pending || !changed || (!own.trim() && !linked)} className="flex-1 rounded-[10px] bg-[#3e281b] py-2 text-sm font-semibold text-[#faf6f0] disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onDone} className="rounded-[10px] px-3 py-2 text-sm text-[#86705f] hover:bg-[#f0e7db]">
          Close
        </button>
      </div>
      {/* Wrong spot, or not a real stop at all. */}
      <div className="flex gap-2 border-t border-[#e2d5c4] pt-2">
        <button type="button" onClick={onMove} className="flex-1 rounded-[10px] py-1.5 text-sm text-[#3e281b] hover:bg-[#f0e7db]">
          Move
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            const ok = await confirm({
              title: "Remove this stop?",
              body: "For a stop the phone made up. The trips on either side join up. Your entries stay as they are.",
              confirmLabel: "Remove",
            });
            if (!ok) return;
            run(async () => {
              const res = await removeStop(visit.id);
              if (res.ok) onDone();
              else setMessage(res.message);
            });
          }}
          className="flex-1 rounded-[10px] py-1.5 text-sm text-[#a3473a] hover:bg-[#f0e7db]"
        >
          Remove
        </button>
      </div>
      {message && <p className="text-xs text-[#a3473a]">{message}</p>}
    </form>
  );
}

// A saved day's routes, joined to where its stops are now. (A stop's place can be moved after the
// day was saved, e.g. Theory's pin nudged to where you usually are inside. Moving a place moves
// it on every day, so each route's ends follow it rather than stopping at the old spot.)
function reattach(trips: Trip[], visits: Visit[]): Trip[] {
  const at = new globalThis.Map(visits.map((v) => [v.id, { lat: v.lat, lng: v.lng }]));
  const near = (a: Spot, b: Spot) => Math.hypot((a.lat - b.lat) * 111_000, (a.lng - b.lng) * 111_000 * Math.cos((a.lat * Math.PI) / 180));
  // The end was the old stop spot (close by): move it. Otherwise (it ended on a road): add the stop.
  const fix = (path: Spot[], stop: Spot | undefined, end: "start" | "end"): Spot[] => {
    if (!stop || !path.length) return path;
    const i = end === "start" ? 0 : path.length - 1;
    const d = near(path[i], stop);
    if (d < 1) return path;
    if (d <= 150) return path.map((p, j) => (j === i ? stop : p));
    return end === "start" ? [stop, ...path] : [...path, stop];
  };
  return trips.map((t) => {
    const pieces = t.pieces.map((p, i) => {
      let path = p.path;
      if (i === 0 && t.fromId) path = fix(path, at.get(t.fromId), "start");
      if (i === t.pieces.length - 1 && t.toId) path = fix(path, at.get(t.toId), "end");
      return path === p.path ? p : { ...p, path };
    });
    return { ...t, pieces };
  });
}

// Dots good enough to be the route as they are: close together in time (a dot every 12 s or
// so) and sure of where they were (±15 m or better), for most of the walk.
function trustworthy(dots: Dot[]): boolean {
  if (dots.length < 8) return false;
  const gaps = dots.slice(1).map((d, i) => d.t - dots[i].t).sort((a, b) => a - b);
  const accs = dots.map((d) => d.acc ?? 30).sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] <= 12_000 && accs[Math.floor(accs.length * 0.7)] <= 15;
}

// The middle of a building's outline (the average of its corners: fine for a building).
function middleOf(outline: [number, number][]) {
  const n = outline.length || 1;
  return { lat: outline.reduce((t, [lat]) => t + lat, 0) / n, lng: outline.reduce((t, [, lng]) => t + lng, 0) / n };
}

// ---------- Popups you can always see ----------

// How far down the window the bars over the map reach (the site's top bar, and the day box when
// it floats on the map): marked data-covers-map.
function coveredTop() {
  let bottom = 0;
  document.querySelectorAll<HTMLElement>("[data-covers-map]").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.top < window.innerHeight / 2) bottom = Math.max(bottom, r.bottom);
  });
  return bottom;
}
// …and how much of the top of the map that hides (px, from the map's top).
function coveredIn(box: HTMLElement | null) {
  return box ? Math.max(0, coveredTop() - box.getBoundingClientRect().top) : 0;
}

// A popup on the map: if any of it is under the bars or below the bottom of the window (when it
// opens, or grows, e.g. search results), the map slides so it's all in view.
function KeepInView({ children }: { children: ReactNode }) {
  const map = useMap();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !map) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const top = coveredTop() + 12;
      const bottom = window.innerHeight - 12;
      let dy = 0;
      if (r.top < top) dy = r.top - top;
      else if (r.bottom > bottom) dy = Math.min(r.bottom - bottom, r.top - top);
      if (Math.abs(dy) > 2) map.panBy(0, dy);
    };
    const t = setTimeout(fit, 120); // (after Google's own nudge)
    const watch = new ResizeObserver(() => fit());
    watch.observe(el);
    return () => {
      clearTimeout(t);
      watch.disconnect();
    };
  }, [map]);
  return <div ref={ref}>{children}</div>;
}
