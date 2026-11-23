"use client";

import { readDark, readDarkServer, subscribeDark } from "@/components/ui/theme";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { APIProvider, InfoWindow, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { useRouter } from "next/navigation";
import { forgetDrawings, lockDay, lookupPlaceOutline, moveStop, myPlaces, pastDrawings, rememberedRoute, removeStop, reportRoute, saveDrawing, savedDrawings, trustedRoutes, saveBlock, setPlaceOutline, setStopOutline, setStopPlace, trailCells, type PlaceLite, type PlacePick } from "@/app/mbm/actions";
import { Search as PlaceSearch, type Found } from "./PlaceSearch";

// Which version of the path engine drew a route (saved with "Route looks wrong" reports).
const PATH_ENGINE = "legs+trails+match-v3 (2026-11-22: into a building at its wall; drawn once, saved)";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import type { Activity, Block, LockedTrip, RoutePoint, Visit } from "@/mbm/data";
import { clock, dayRange, span } from "@/mbm/time";
import { HtmlMarker, KEY, MAP_GROUND, stylesFor } from "./mapBits";
import { fitToEntries, buildTrips, decodePolyline, joinSameBuilding, metres, type Piece, type Spot, type Trip } from "@/mbm/trips";
import { encodePolyline, snapLeg } from "@/mbm/snap";
import { splitLegs, waitSpot, type Dot } from "@/mbm/legs";
import { despike, makeTrails, smooth } from "@/mbm/trails";
import { buildingAt, nearOutline } from "@/mbm/buildings";
import { isMoving } from "@/mbm/moving";
import { fitsTrusted } from "@/mbm/routefit";
import { cantMoveTo, pickIsNear } from "@/mbm/nearcheck";

// The stretch you're hovering on the day bar. moving: light up the route (Commute); still: the
// stop you were at (everything else); any: both (untracked time).
// spans: several stretches at once (arriving from a stats tile: every commute, every unmarked bit).
export type Focus = { start: number; end: number; kind: "moving" | "still" | "any"; spans?: { start: number; end: number }[] };
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
  walk = null,
  follow = null,
}: {
  walk?: { start: number; end: number; t: number; color: string } | null; // (Reflect) someone walking the route: where they are at time t
  follow?: { top: number; bottom: number } | null; // (Reflect) the camera goes to what's lit up, clear of what covers the map
  dayKey?: string;
  finished?: boolean; // the day's over: once drawn, its routes are saved (034_locked_days.sql)
  locked?: LockedTrip[] | null; // its saved routes: drawn as they are, nothing worked out again
  gestures?: "cooperative" | "greedy" | "none"; // none: just to watch (Reflect): nothing reacts to the pointer
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
  const [movePending, runMove] = useTransition();
  // A trip you clicked: "Add as Commute" (when nothing's tracked for it), and "Route looks wrong".
  const [adding, setAdding] = useState<{ trip: Trip; x: number; y: number; untracked: boolean; below?: boolean; note?: string; report?: "writing" | "sent" } | null>(null);
  const [reportText, setReportText] = useState("");
  const [stars, setStars] = useState(0); // (rating a route: 1-5, 0 = not picked yet)
  const [addPending, runAdd] = useTransition();
  const [zoom, setZoom] = useState(15);
  const dark = useSyncExternalStore(subscribeDark, readDark, readDarkServer); // (night mode: the map too)
  // Covered in the map's own color until its pictures have loaded (then the cover fades): a new
  // map (another day) never flashes white, at night especially.
  const [painted, setPainted] = useState(false);
  // What the pointer is on: trips under it (several, where paths overlap) or a stop.
  const [pointed, setPointed] = useState<{ trips: string[]; stops: string[]; guesses?: string[]; x: number; y: number; cover?: number; under?: number; gap?: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // A stop whose building is known but whose spot is out on the street (GPS wanders indoors): it's
  // drawn in the middle of the building, and its routes go there.
  // Back-to-back stops in one building that you never left: one stop (trips.ts).
  const visits = useMemo(
    () => joinSameBuilding(phoneVisits, points).map((v) => (v.outline && !nearOutline(v.outline, v.lat, v.lng, 0) ? { ...v, ...middleOf(v.outline) } : v)),
    [phoneVisits, points],
  );
  const day = useMemo(() => {
    if (!dayKey) return null;
    const r = dayRange(dayKey, tz);
    return { start: +r.start, end: +r.end };
  }, [dayKey, tz]);
  const built = useMemo(() => (locked ? [] : fitToEntries(buildTrips(visits, points), blocks)), [visits, points, blocks, locked]);
  const filled = useFilledTrips(built, points);
  const trips: Trip[] = useMemo(() => toStops(locked ? reattach(locked as unknown as Trip[], visits) : filled.trips, visits), [locked, filled.trips, visits]);
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
    const overlaps = (a: number, b: number) =>
      (focus.spans ?? [focus]).some((f) => Math.min(b, f.end) - Math.max(a, f.start) > Math.min(60_000, (f.end - f.start) / 2));
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
  const point = (p: { trips: string[]; stops: string[]; guesses?: string[]; x: number; y: number; under?: number; gap?: number } | null) => {
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
  // A stop's bubble: always in the same place, centered over its marker (not wherever the
  // pointer came in), with room between them (gap).
  const overStop = (el: HTMLElement) => {
    const r = box.current?.getBoundingClientRect();
    const m = el.getBoundingClientRect();
    return r ? { x: m.left + m.width / 2 - r.left, y: m.top - r.top, under: m.bottom - r.top, gap: 22 } : { x: 0, y: 0 };
  };
  // Where you are now (today only): the stop you haven't left, if it's the latest thing the phone
  // knows (or the last stop, while your newest dot is still in its building); otherwise the last dot.
  const here = useMemo(() => {
    if (!liveColor) return null;
    const last = points.length ? points[points.length - 1] : null;
    const open = [...visits].reverse().find((v) => !v.departed_at);
    // You're where the phone's newest dots say once the last two both put you somewhere else, by
    // more than the phone says they could be off by (twice their accuracy), and outside the
    // stop's building. No set distance: a sharp fix across the street counts (the phone's stop
    // can lag behind it, as at the Book Store), a fuzzy indoor one doesn't.
    // (A dot the phone itself filed under the stop, "still", is you there, however far indoor GPS
    // has wandered: at Theory it drifts a block east, past Hawthorne Ct. Only a moving dot can
    // say you've gone.)
    const away = (p: RoutePoint) =>
      p.motion !== "still" &&
      +new Date(p.at) > +new Date(open!.arrived_at) &&
      p.accuracy_m != null &&
      !nearOutline(open!.outline, p.lat, p.lng, 0) &&
      // (Against where the phone has the stop, not the place's pin it's drawn at: Home!'s pin is
      // on Theory's Lake St side, you're often well inside.)
      metres(open!.gps ?? open!, p) > 2 * p.accuracy_m;
    const left = open && points.length >= 2 && away(points[points.length - 1]) && away(points[points.length - 2]);
    if (open && !left) return { at: { lat: open.lat, lng: open.lng }, when: null };
    // No stop open (the phone hasn't sent the one you're in yet, or closed the last a bit early),
    // but your newest dot is inside the last stop's building: you're there, so it's that stop
    // (Home!), not a loose dot in the middle of it.
    const prev = visits.length ? visits[visits.length - 1] : null;
    if (!open && last && prev?.outline && nearOutline(prev.outline, last.lat, last.lng, 0)) {
      return { at: { lat: prev.lat, lng: prev.lng }, when: null };
    }
    // Or every dot since you "left" it the phone files as standing still, and each is within twice
    // its accuracy of it (or in its building): you never left; it's that stop.
    if (!open && last && prev?.departed_at) {
      const since = points.filter((p) => +new Date(p.at) > +new Date(prev.departed_at!));
      const there = (p: RoutePoint) => nearOutline(prev.outline, p.lat, p.lng, 0) || metres(prev.gps ?? prev, p) <= 2 * (p.accuracy_m ?? 20);
      if (since.length && since.every((p) => p.motion === "still" && there(p))) return { at: { lat: prev.lat, lng: prev.lng }, when: null };
    }
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
    <div ref={box} className="relative size-full" style={{ background: dark ? MAP_GROUND.night : MAP_GROUND.day }} onMouseLeave={() => pointed && point(null)}>
    {all.length > 0 && !follow && <WholeDay onClick={() => setRefit((n) => n + 1)} />}
    <APIProvider apiKey={KEY}>
      <Map
        styles={stylesFor(zoom, dark)}
        backgroundColor={dark ? MAP_GROUND.night : MAP_GROUND.day}
        onTilesLoaded={() => setPainted(true)}
        onZoomChanged={(e) => setZoom(e.detail.zoom)}
        defaultCenter={all[0] ?? { lat: 43.0731, lng: -89.4012 }}
        defaultZoom={15}
        gestureHandling={gestures}
        disableDefaultUI
        clickableIcons={false}
        draggableCursor={moving ? "crosshair" : undefined}
        onClick={(e) => {
          if (gestures === "none") return;
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
            const no = await cantMoveTo(v.id, at.lat, at.lng);
            if (no) return setMoveNote(no);
            const res = await moveStop(v.id, at.lat, at.lng);
            setMoveNote(res.ok ? null : res.message);
            if (res.ok && v.placeId) lookedUp.delete(v.placeId); // (its building is looked up again at the new spot)
          });
        }}
        className="size-full"
      >
        {!follow && <FitTo spots={all} top={topCover} again={refit} />}
        {follow && <Follow spots={followSpots(lit, visits, trips, all)} cover={follow} />}
        {walk && <Walker trips={trips} walk={walk} />}
        {gestures !== "none" && <PointerTrack trips={trips} onHit={(hit, e, guesses) => point(hit.length ? { trips: hit, stops: [], guesses, ...where(e) } : null)} />}
        {showDots && <Dots points={outdoorDots} tz={tz} />}
        {/* The building you were in, lit up while you hover the stop (here or on the day bar). */}
        {visits.map((v) => (v.outline && lit?.stops.has(v.id) ? <Building key={`b-${v.id}`} outline={v.outline} /> : null))}
        {trips.map((t) => {
          const on = lit?.trip.has(t.key) ?? false;
          return (
            <TripLine key={t.key} pieces={t.pieces} lit={on} faded={dimming && !on} hidden={!!walk && t.end > walk.start && t.start < walk.end} />
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
                className={`block size-2.5 cursor-default rounded-full border-2 border-[#9c8b7b] bg-[#faf6f0] transition-opacity ${
                  dimming && !lit?.trip.has(t.key) ? "opacity-35" : ""
                }`}
              />
            </HtmlMarker>
          ));
        })}
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
                  if (gestures === "none") return;
                  point(null);
                  setOpen(v);
                }}
                onMouseEnter={(e) => gestures !== "none" && open?.id !== v.id && point({ trips: [], stops: samePlace(visits, v).map((x) => x.id), ...overStop(e.currentTarget) })}
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
      {/* (Below whatever floats over the top of the map, the day's bar: it used to hide under it.) */}
      {moving && (
        <div
          className="absolute inset-x-3 z-30 flex items-center justify-between gap-3 rounded-control bg-accent px-3 py-2 text-sm text-accent-ink shadow-lg"
          style={{ top: topCover + 12 }}
        >
          <span>Click where {moving.place ?? moving.auto_name ?? "this stop"} really is (in or next to the building your phone had you in)</span>
          <button type="button" onClick={() => setMoving(null)} className="rounded-control px-2 py-0.5 font-semibold hover:bg-accent-ink/10">
            Cancel
          </button>
        </div>
      )}
      {movePending && !moving && (
        <p className="absolute inset-x-3 z-30 flex items-center gap-2 rounded-control bg-paper px-3 py-2 text-sm text-ink shadow" style={{ top: topCover + 12 }}>
          <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-line border-t-ink" />
          Checking it&rsquo;s next to where your phone had you, then moving it…
        </p>
      )}
      {moveNote && !movePending && (
        <p className="absolute inset-x-3 z-30 flex items-start justify-between gap-3 rounded-control bg-paper px-3 py-2 text-sm text-danger shadow" style={{ top: topCover + 12 }}>
          <span>{moveNote}</span>
          <button type="button" onClick={() => setMoveNote(null)} aria-label="Dismiss" className="shrink-0 text-muted hover:text-ink">
            ✕
          </button>
        </p>
      )}
      {pin && !pin.at && !moving && (
        <p className="pointer-events-none absolute left-3 top-3 rounded-full bg-paper/95 px-3 py-1 text-xs text-muted shadow-sm ring-1 ring-line">
          {pin.location ? `Not sure where “${pin.location.split(",")[0]}” is` : "No place set for this plan"}
        </p>
      )}
      {nothingLit && !moving && !pin && (
        <p style={follow ? { top: follow.top } : undefined} className="pointer-events-none absolute left-3 top-3 rounded-full bg-paper/95 px-3 py-1 text-xs text-muted shadow-sm ring-1 ring-line">
          {focus?.kind === "moving" ? "No route recorded then" : "No location recorded then"}
        </p>
      )}
      <BuildingNote status={buildings} needsSql={visits.some((v) => v.place && !v.placeId)} />
    </APIProvider>
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[5] transition-opacity duration-500 ease-out"
      style={{ background: dark ? MAP_GROUND.night : MAP_GROUND.day, opacity: painted ? 0 : 1 }}
    />
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
                    // Way off: drawn again with the latest rules (your report keeps the old line).
                    const orig = built.find((b) => b.key === t.key);
                    if (stars <= 2 && orig) void filled.redraw(orig);
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
          under={pointed.under}
          gap={pointed.gap}
          cover={pointed.cover ?? 0}
          heading={!pointed.stops.length && pointed.trips.length > 1 ? `${pointed.trips.length} trips here` : undefined}
          rows={[
            ...trips.filter((t) => pointed.trips.includes(t.key)).map((t) => tripRow(t, blocks, activities, tz, pointed.guesses?.includes(t.key))),
            ...(pointed.stops.length ? stopRows(visits.filter((v) => pointed.stops.includes(v.id)), blocks, activities, day, { visits, points, trips }) : []),
          ]}
        />
      )}
    </div>
  );
}

type Row = { key: string; color: string; title: string; detail: string; untracked?: boolean; hint?: string };

// A trip, named after the moving entry during it (Commute, or later Running…). Never after a
// still one like a class: if no moving entry covers it, it's just a trip nothing was tracked for.
// guess: the pointer's on a bit of it the phone missed (filled in along the streets): "Commute ✦".
function tripRow(t: Trip, blocks: Block[], activities: Activity[], tz: string, guess = false): Row {
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
    title: `${best?.name ?? "Commute detected"}${guess ? " ✦" : ""}`,
    hint: best ? undefined : "click to add",
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
// (under: where the thing pointed at ends, if it's below the pointer spot, like a stop's dot;
// gap: the space between them.)
function Tip({ x, y, rows, heading, cover = 0, under, gap = 14 }: { x: number; y: number; rows: Row[]; heading?: string; cover?: number; under?: number; gap?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  // Placed once it's drawn and its size is known: above the pointer; under it when that runs into
  // the top (or what covers the map); beside it when neither fits (the bottom of the map or the
  // window cut it off).
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.offsetParent as HTMLElement | null;
    if (!el || !box) return;
    const b = box.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const topLimit = Math.max(cover, -b.top) + 8;
    const bottomLimit = Math.min(b.height, window.innerHeight - b.top) - 8;
    const aboveTop = y - gap - h;
    const belowTop = (under ?? y) + gap + 4;
    let left = x - w / 2;
    let top: number;
    if (aboveTop >= topLimit) top = aboveTop;
    else if (belowTop + h <= bottomLimit) top = belowTop;
    else {
      top = Math.max(topLimit, Math.min(y - h / 2, bottomLimit - h));
      left = x + gap + 6 + w <= b.width - 8 ? x + gap + 6 : x - gap - 6 - w;
    }
    left = Math.max(8, Math.min(left, b.width - w - 8));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = "visible";
  });
  if (!rows.length) return null;
  return (
    <div
      ref={ref}
      role="tooltip"
      className="pointer-events-none invisible absolute left-0 top-0 z-30 w-max max-w-64 rounded-card bg-ink px-3 py-2 text-paper shadow-lg"
    >
      {heading && <p className="mb-1 text-[11px] text-paper/60">{heading}</p>}
      <ul className="flex flex-col gap-1">
        {rows.map((r) => (
          <li key={r.key} className="leading-tight">
            <p className={`flex items-center gap-1.5 text-sm font-semibold ${r.hint ? "whitespace-nowrap" : ""}`}>
              <span className="size-2 shrink-0 rounded-full ring-1 ring-paper/40" style={{ background: r.color }} />
              {r.title}
              {r.hint && <span className="whitespace-nowrap font-normal text-paper/50">· {r.hint}</span>}
            </p>
            <p className="num text-xs text-paper/70">{r.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Which trips are under the pointer (within ~10 px of their line), as it moves over the map.
// (guesses: the ones where the pointer is on a bit the phone missed, filled in.)
function PointerTrack({ trips, onHit }: { trips: Trip[]; onHit: (keys: string[], e: { clientX: number; clientY: number }, guesses: string[]) => void }) {
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
        const under = (p: Piece) => {
          let prev = px(p.path[0]);
          for (let i = 1; i < p.path.length; i++) {
            const cur = px(p.path[i]);
            if (near(prev, cur) < 10) return true;
            prev = cur;
          }
          return false;
        };
        const hitTrips = trips.filter((t) => t.pieces.some(under));
        const hit = hitTrips.map((t) => t.key);
        const guesses = hitTrips.filter((t) => t.pieces.some((p) => p.missing && !plainly(p.path) && under(p))).map((t) => t.key);
        const sig = hit.join("|") + "/" + guesses.join("|");
        if (sig === last && !hit.length) return;
        last = sig;
        report.current(hit, dom, guesses);
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
function useFilledTrips(trips: Trip[], points: RoutePoint[]): { trips: Trip[]; settled: boolean; redraw: (t: Trip) => Promise<void> } {
  const [again, setAgain] = useState(0); // (bumped by redraw: work out the forgotten pieces)
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
    // Lines already saved for these pieces (061): drawn exactly that way, on every reload and
    // device. Asked once for the lot.
    const fresh = trips.flatMap((t) => t.pieces.map((_, i) => ({ t, i }))).filter(({ t, i }) => !asked.current.has(pieceKey(t, i)));
    const savedP = fresh.length ? savedDrawings(fresh.map(({ t, i }) => drawKey(t, i))).catch(() => ({}) as Awaited<ReturnType<typeof savedDrawings>>) : null;
    for (const t of trips) {
      t.pieces.forEach(async (p, i) => {
        const key = pieceKey(t, i);
        if (asked.current.has(key)) return;
        asked.current.add(key);
        const dk = drawKey(t, i);
        // Drawn in this browser before the 2026-11-22 change, for a piece whose ends haven't
        // changed: that's the line you saw (the Spring St one with its divot). It wins, and
        // replaces whatever was saved for it since.
        const before = keptPieceBefore(key);
        if (before?.path) {
          setBetter((m) => ({ ...m, [key]: before.path! }));
          if (before.guess) setGuessed((g) => new Set(g).add(key));
          keepPiece(key, before.path, before.guess);
          void saveDrawing({ key: dk, path: before.path, guess: before.guess, fromId: t.fromId, toId: t.toId, dots: p.dots?.length ?? 0, spread: spreadOf(p.dots), replace: true })
            .then(() => forgetBefore(key)) // (once saved for everywhere, its old copy's done)
            .catch(() => {});
          setDoneKeys((d) => new Set(d).add(key));
          return;
        }
        const saved = savedP ? (await savedP)[dk] : undefined;
        if (saved && saved.path.length >= 2) {
          setBetter((m) => ({ ...m, [key]: saved.path }));
          if (saved.guess) setGuessed((g) => new Set(g).add(key));
          keepPiece(key, saved.path, saved.guess);
          setDoneKeys((d) => new Set(d).add(key));
          return;
        }
        // (Drawn in this browser by the way before, for a piece whose ends haven't changed: kept,
        // rather than worked out again and maybe drawn worse.)
        const local = keptPiece(key);
        if (local) {
          // (Worked out in this browser before 061: saved for everywhere else too.)
          if (local.path) {
            setBetter((m) => ({ ...m, [key]: local.path! }));
            if (local.guess) setGuessed((g) => new Set(g).add(key));
            keepPiece(key, local.path, local.guess);
          }
          if (local.path) void saveDrawing({ key: dk, path: local.path, guess: local.guess, fromId: t.fromId, toId: t.toId, dots: p.dots?.length ?? 0, spread: spreadOf(p.dots) }).catch(() => {});
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
        // Then earlier trips' saved lines between the same places (061): a trip you make often
        // is drawn the same way each time, when your dots fit it.
        const trusted = whole
          ? [
              ...(await trustedRoutes(t.fromId!, t.toId!).catch(() => [])),
              ...(await pastDrawings(t.fromId!, t.toId!).catch(() => [])),
            ].map((r) => ({ ...r, line: r.reversed ? [...r.line].reverse() : r.line }))
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
              const matched = await snapLeg(l.dots, l.mode);
              if (matched) return matched;
              // Not on any path the map knows: your dots, their GPS zigzags evened out, as a curve.
              return l.mode === "walk" && (l.known >= 0.6 || trustworthy(l.dots)) ? curve(l.dots, true) : curve(l.dots);
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
            // (Turning straight back on itself is never the way you walked: Google ends a route on
            // the nearest path, sometimes a few steps past the spot and back, which drew a stub
            // sticking out of Steenbock on Nov 23. And a way round that's much longer than the gap
            // isn't how you got there either: a box around the lawn for a 40 m walk up. Then
            // straight across.)
            const joinTo = async (from: Spot, to: Spot) => {
              if (metres(from, to) <= 40) return [];
              const found = await walkingRoute(from, to).catch(() => null);
              const way = found ? noReversals(found) : null;
              const long = way ? way.slice(1).reduce((t, s, i) => t + metres(way[i], s), 0) : Infinity;
              return way && long <= metres(from, to) * 1.6 + 20 ? way : [];
            };
            const first = head.length ? head[head.length - 1] : null;
            const lead = first && metres(first, body[0]) > 40 ? await joinTo(first, body[0]) : [];
            const tail = p.ends?.to ? await joinTo(body[body.length - 1], b) : [];
            path = [...head, ...lead, ...body, ...tail, ...(p.ends?.to ? [b] : [])];
          }
          if (thin) {
            // (Too few dots to check a trusted route against: still the best guess, dashed.)
            const remembered = trusted[0]?.line.slice(1, -1) ?? (whole ? await rememberedRoute(t.fromId!, t.toId!).catch(() => null) : null);
            const found = remembered ?? (await gapRoute(t, i, a, b));
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
          const found = remembered ?? (await gapRoute(t, i, a, b));
          path = found ? [a, ...found, b] : null;
        }
        if (path && path.length >= 2) setBetter((m) => ({ ...m, [key]: path! }));
        keepPiece(key, path && path.length >= 2 ? path : null, guessedNow);
        if (path && path.length >= 2)
          void saveDrawing({ key: dk, path, guess: guessedNow, fromId: t.fromId, toId: t.toId, dots: p.dots?.length ?? 0, spread: spreadOf(p.dots) }).catch(() => {});
        } finally {
          setDoneKeys((d) => new Set(d).add(key));
        }
      });
    }
  }, [trips, ready, trails, again]);
  // Rated way off: this trip's lines are forgotten (here, in this browser, and saved) and worked out again.
  const redraw = async (t: Trip) => {
    const keys = t.pieces.map((_, i) => pieceKey(t, i));
    await forgetDrawings(t.pieces.map((_, i) => drawKey(t, i))).catch(() => {});
    for (const k of keys) {
      asked.current.delete(k);
      forgetBefore(k);
      try {
        localStorage.removeItem(keptId(k));
      } catch {}
    }
    const drop = <T,>(m: Record<string, T>) => Object.fromEntries(Object.entries(m).filter(([k]) => !keys.includes(k)));
    setBetter((m) => drop(m));
    setGuessed((g) => new Set([...g].filter((k) => !keys.includes(k))));
    setDoneKeys((d) => new Set([...d].filter((k) => !keys.includes(k))));
    setAgain((n) => n + 1);
  };
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
  return { trips: filled, settled, redraw };
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
// The way routes were drawn before (only the ends into buildings changed since): its copies
// still count for pieces whose ends are the same.
const ENGINE_BEFORE = "legs+trails+match-v2 (2026-11-18: your dots win on your own paths)";
function keptPieceBefore(k: string): KeptPiece | undefined {
  try {
    const v = localStorage.getItem(`mbm-piece:${ENGINE_BEFORE}:${k}`);
    if (!v || v === "none") return undefined;
    const guess = v.startsWith("g:");
    return { path: decodePolyline(guess ? v.slice(2) : v, 6), guess };
  } catch {
    return undefined;
  }
}

function forgetBefore(k: string) {
  try {
    localStorage.removeItem(`mbm-piece:${ENGINE_BEFORE}:${k}`);
  } catch {}
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
// A route that goes into a building ends at its wall, the way you went in (trips.ts); from there
// it's carried straight on to the stop's dot inside, so the line meets the stop. (Only drawn
// here: what's saved and matched is the way to the building.)
function toStops(trips: Trip[], visits: Visit[]): Trip[] {
  const byId = new globalThis.Map(visits.map((v) => [v.id, v]));
  return trips.map((t) => {
    const from = t.fromId ? byId.get(t.fromId) : undefined;
    const to = t.toId ? byId.get(t.toId) : undefined;
    if (!t.pieces.length || (!from && !to)) return t;
    const pieces = t.pieces.map((p) => ({ ...p, path: [...p.path] }));
    const first = pieces[0].path;
    const last = pieces[pieces.length - 1].path;
    if (from && first.length && metres(first[0], from) > 2) first.unshift({ lat: from.lat, lng: from.lng });
    if (to && last.length && metres(last[last.length - 1], to) > 2) last.push({ lat: to.lat, lng: to.lng });
    return { ...t, pieces };
  });
}

// A piece as saved (061): the way routes are drawn, and its own dots (first, last, how many),
// or for a piece with none, its trip and times; plus its ends to ~10 m. Steady across reloads:
// it only changes when the trip's dots do.
const drawKey = (t: Trip, i: number) => {
  const p = t.pieces[i];
  const f = (s: Spot) => `${s.lat.toFixed(4)},${s.lng.toFixed(4)}`;
  const ends = `${f(p.path[0])}>${f(p.path[p.path.length - 1])}`;
  const d = p.dots;
  const what = d?.length ? `d:${d[0].t}:${d[d.length - 1].t}:${d.length}` : `m:${t.key}:${Math.round(t.start / 60000)}:${Math.round(t.end / 60000)}:${i}`;
  return `${PATH_ENGINE.slice(0, 24)}|${what}|${ends}`;
};

// How sure the phone was for these dots: their median accuracy (metres).
function spreadOf(dots?: { acc?: number | null }[]): number | null {
  const a = (dots ?? []).map((d) => d.acc).filter((v): v is number => typeof v === "number").sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : null;
}

const pieceKey = (t: Trip, i: number) => {
  const p = t.pieces[i].path;
  const f = (s: Spot) => `${s.lat.toFixed(5)},${s.lng.toFixed(5)}`;
  return `${t.key}:${p.length}:${f(p[0])}:${f(p[p.length - 1])}:${t.pieces[i].missing ? "m" : "r"}`;
};

// Google's walking route between two spots (Routes API; it has to be allowed on the key).
// (mode DRIVE for a trip you made by car or bus: walking directions take crosswalks and paths a
// car never would.)
// heading: the way you were going at each end (degrees), so a car route starts off that way (from
// a point on a divided road, Google otherwise may start down the other side and turn round).
async function walkingRoute(a: Spot, b: Spot, mode: "WALK" | "DRIVE" = "WALK", heading: { from?: number | null; to?: number | null } = {}): Promise<Spot[] | null> {
  const hv = (h?: number | null) => (mode === "DRIVE" && h != null ? Math.round(((h % 360) + 360) % 360) : null);
  const h0 = hv(heading.from);
  const h1 = hv(heading.to);
  const id = `mbm-${mode === "WALK" ? "walk" : "drive"}:${a.lat.toFixed(4)},${a.lng.toFixed(4)}>${b.lat.toFixed(4)},${b.lng.toFixed(4)}${h0 != null || h1 != null ? `@${h0 ?? ""},${h1 ?? ""}` : ""}`;
  try {
    const kept = localStorage.getItem(id);
    if (kept) return JSON.parse(kept) as Spot[];
  } catch {}
  try {
    const at = (s: Spot, h: number | null) => ({ location: { latLng: { latitude: s.lat, longitude: s.lng }, ...(h != null ? { heading: h } : {}) } });
    const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": KEY!, "X-Goog-FieldMask": "routes.polyline.encodedPolyline" },
      body: JSON.stringify({ origin: at(a, h0), destination: at(b, h1), travelMode: mode }),
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

// A bit the phone missed, filled in along the streets (driving directions for a car trip), heading
// off the way you were going and arriving the way you went on. If the directions still go out of
// their way and come back past where they started (a U-turn down the road), that loop is cut off:
// from the last time they pass by the start (within its dot's accuracy), to the first time they
// reach the end.
async function gapRoute(t: Trip, i: number, a: Spot, b: Spot): Promise<Spot[] | null> {
  const before = t.pieces[i - 1]?.dots ?? [];
  const after = t.pieces[i + 1]?.dots ?? [];
  const bearing = (p: Spot, q: Spot) => (Math.atan2((q.lng - p.lng) * Math.cos((p.lat * Math.PI) / 180), q.lat - p.lat) * 180) / Math.PI;
  // (The way you were going: from a dot a little way back, so GPS wobble doesn't decide it.)
  const way = (dots: Dot[], atEnd: boolean) => {
    if (dots.length < 2) return null;
    const ref = atEnd ? dots[dots.length - 1] : dots[0];
    const list = atEnd ? [...dots].reverse() : dots;
    const other = list.find((d) => metres(d, ref) >= 2 * (ref.acc ?? 10));
    if (!other) return null;
    return atEnd ? bearing(other, ref) : bearing(ref, other);
  };
  const car = byCar(t);
  // By car: start from where the drive before it is drawn to end (its dots matched to the road),
  // not the last raw dot. The phone's stand-in dots drift off the road (on Nov 22, 70 m up a side
  // street off University Ave), and directions from there went round the block to get back.
  // (The same match as drawing it: kept in this browser, so asking again is instant.)
  let from = a;
  if (car && before.length >= 3) {
    const legs = splitLegs(before);
    const last = legs[legs.length - 1];
    if (last?.mode === "ride") {
      const matched = await snapLeg(last.dots, "ride").catch(() => null);
      const end = matched?.[matched.length - 1];
      if (end && metres(end, a) <= Math.max(50, 2 * (before[before.length - 1].acc ?? 25))) from = end;
    }
  }
  const path = await walkingRoute(from, b, car ? "DRIVE" : "WALK", car ? { from: way(before, true), to: way(after, false) } : {});
  if (!path) return null;
  if (path.length < 3) return from === a ? path : [from, ...path];
  const tolA = Math.max(25, before[before.length - 1]?.acc ?? 25);
  const tolB = Math.max(25, after[0]?.acc ?? 25);
  let j = 0;
  for (let k = 1; k < path.length; k++) if (metres(path[k], from) <= tolA) j = k;
  let e = path.length - 1;
  for (let k = j + 1; k < path.length; k++)
    if (metres(path[k], b) <= tolB) {
      e = k;
      break;
    }
  const kept = unloop(path.slice(j, e + 1), Math.max(tolA, tolB));
  return from === a ? kept : [from, ...kept];
}

// Directions that go round a block and come back to nearly where they were (a car turning round
// because the start was put on the wrong side of a divided road, Nov 22 at Farley Ave): the loop
// is cut out. A loop: two points of the route close together (within twice the dots' accuracy,
// 80 to 100 m: about a block's width) with at least four times that much route between them.
// A path that goes somewhere and comes straight back the same way (out and back, ending within a
// quarter of the way out from where it turned): the out-and-back left out.
function noReversals(path: Spot[]): Spot[] {
  const out: Spot[] = [];
  for (const p of path) {
    out.push(p);
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3);
      const ab = metres(a, b);
      const bc = metres(b, c);
      if (ab > 3 && bc > 3 && metres(a, c) < 0.25 * Math.min(ab, bc)) out.splice(out.length - 2, 1);
      else break;
    }
  }
  return out;
}

export function unloop(path: Spot[], tol: number): Spot[] {
  const near = Math.min(100, Math.max(80, 2 * tol));
  const along = [0];
  for (let k = 1; k < path.length; k++) along.push(along[k - 1] + metres(path[k - 1], path[k]));
  const out: Spot[] = [];
  for (let i = 0; i < path.length; i++) {
    out.push(path[i]);
    // The furthest point further on that comes back close to this one, after a long way round.
    let skip = -1;
    for (let k = path.length - 1; k > i + 1; k--) {
      const chord = metres(path[i], path[k]);
      if (chord <= near && along[k] - along[i] >= 4 * Math.max(chord, near / 2)) {
        skip = k;
        break;
      }
    }
    if (skip > 0) i = skip - 1;
  }
  return out;
}

// Made by car or bus: its dots went faster than anyone walks or runs (legs.ts calls it a ride),
// or overall it went at more than a run.
function byCar(t: Trip) {
  if (t.pieces.some((p) => p.dots && splitLegs(p.dots).some((l) => l.mode === "ride"))) return true;
  return (t.pace ?? 0) > 4;
}

// A trip: always a solid line. Where the way is really a guess (the phone missed it), hovering
// that bit says so ("Commute ✦"). Lit = the hovered stretch (thicker, caramel); faded = the rest of the day
// while hovering. hidden: being drawn in by Reflect right now (it draws its own).
function TripLine({ pieces, lit, faded, hidden = false }: { pieces: Piece[]; lit: boolean; faded: boolean; hidden?: boolean }) {
  if (hidden) return null;
  return pieces.map((p, i) => (
    <Fragment key={i}>
      <Route path={p.path} dashed={false} lit={lit} faded={faded} />
    </Fragment>
  ));
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
          // (Only a building it's in: a stop outside one, on the sidewalk, is outdoors.)
          const outline = await buildingAt(at.lat, at.lng, undefined, 25, true).catch(() => undefined);
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
    // Stops all in one place (the same building all day): don't zoom in past the building and
    // its neighbours.
    const once = core.event.addListenerOnce(map, "idle", () => {
      if ((map.getZoom() ?? 0) > 17) map.setZoom(17);
    });
    return () => once.remove();
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

// (Reflect) What the camera should show: what's lit up (the stops, the routes), else the whole day.
function followSpots(lit: { trip: Set<string>; stops: Set<string> } | null, visits: Visit[], trips: Trip[], all: Spot[]): Spot[] {
  if (!lit) return all;
  const out: Spot[] = [];
  for (const v of visits) if (lit.stops.has(v.id)) out.push({ lat: v.lat, lng: v.lng });
  for (const t of trips) if (lit.trip.has(t.key)) for (const p of t.pieces) for (const s of p.path) out.push(s);
  return out.length ? out : all;
}

// (Reflect) The camera glides to the spots: one place, close in (a block or so around it); several,
// all of them, clear of the bubbles over the top and bottom of the map.
function Follow({ spots, cover }: { spots: Spot[]; cover: { top: number; bottom: number } }) {
  const map = useMap();
  const core = useMapsLibrary("core");
  const key = spots.length ? `${spots.length}:${spots[0].lat.toFixed(5)},${spots[0].lng.toFixed(5)}:${spots.at(-1)!.lat.toFixed(5)}` : "";
  useEffect(() => {
    if (!map || !core || !spots.length) return;
    // (Never more padding than the map has room for: Google then zooms out to the whole country.)
    const h = map.getDiv().clientHeight || 600;
    const room = Math.max(0, h - 160);
    const want = cover.top + cover.bottom + 80;
    const k = want > room ? room / want : 1;
    const pad = { top: Math.round((cover.top + 40) * k), bottom: Math.round((cover.bottom + 40) * k), left: 60, right: 60 };
    const bounds = new core.LatLngBounds();
    for (const s of spots) bounds.extend(s);
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const small = metres({ lat: ne.lat(), lng: ne.lng() }, { lat: sw.lat(), lng: sw.lng() }) < 120;
    if (small) {
      // One place: centred in the clear part of the map, at building-and-neighbours zoom.
      const c = bounds.getCenter();
      if (Math.abs((map.getZoom() ?? 17) - 17) > 0.5) map.setZoom(17);
      // (The map's middle sits a little south of it, by half of how much more the bottom is covered.)
      const perPx = (156543.03 * Math.cos((c.lat() * Math.PI) / 180)) / 2 ** 17;
      map.panTo({ lat: c.lat() - (((cover.bottom - cover.top) / 2) * perPx) / 111_320, lng: c.lng() });
      return;
    }
    map.fitBounds(bounds, pad);
    const once = core.event.addListenerOnce(map, "idle", () => {
      if ((map.getZoom() ?? 0) > 18) map.setZoom(18);
    });
    return () => once.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when what's shown changes
  }, [map, core, key, cover.top, cover.bottom]);
  return null;
}

// (Reflect) Someone walking a route: the line drawn in behind them as they go (like a pen
// tracing it). Just the line: no dot at its tip.
function Walker({ trips, walk }: { trips: Trip[]; walk: { start: number; end: number; t: number; color: string } }) {
  const on = trips.filter((x) => x.end > walk.start && x.start < walk.end).sort((a, b) => a.start - b.start);
  // Each trip's whole line, and how far along it each point is (metres).
  const lines = on.map((trip) => {
    const path = trip.pieces.flatMap((p) => p.path);
    const at = [0];
    for (let i = 1; i < path.length; i++) at.push(at[i - 1] + metres(path[i - 1], path[i]));
    return { trip, path, at, total: at[at.length - 1] };
  });
  // Where they are at time t: which trip, and the line up to there.
  const upTo = (t: number) => {
    const out: Spot[] = [];
    let here: Spot | null = null;
    for (const l of lines) {
      if (l.path.length === 0) continue;
      const frac = Math.min(1, Math.max(0, (t - l.trip.start) / Math.max(1, l.trip.end - l.trip.start)));
      if (frac <= 0) break;
      const want = frac * l.total;
      let i = 1;
      while (i < l.path.length && l.at[i] < want) {
        out.push(l.path[i - 1]);
        i++;
      }
      out.push(l.path[i - 1]);
      if (i < l.path.length) {
        const k = l.at[i] - l.at[i - 1] ? (want - l.at[i - 1]) / (l.at[i] - l.at[i - 1]) : 0;
        here = { lat: l.path[i - 1].lat + (l.path[i].lat - l.path[i - 1].lat) * k, lng: l.path[i - 1].lng + (l.path[i].lng - l.path[i - 1].lng) * k };
        out.push(here);
      } else here = l.path[l.path.length - 1];
      if (frac < 1) break;
    }
    return { drawn: out, here };
  };
  if (!lines.length) return null;
  return <Ink path={upTo(walk.t).drawn} color={walk.color} />;
}

// (Reflect) The line drawn so far: one polyline, its points updated as it grows (not a new line
// every frame), with a soft wider glow under it.
function Ink({ path, color }: { path: Spot[]; color: string }) {
  const map = useMap();
  const maps = useMapsLibrary("maps");
  const lines = useRef<google.maps.Polyline[]>([]);
  useEffect(() => {
    if (!map || !maps) return;
    const glow = new maps.Polyline({ map, clickable: false, strokeColor: color, strokeOpacity: 0.25, strokeWeight: 16, zIndex: 3 });
    const pen = new maps.Polyline({ map, clickable: false, strokeColor: color, strokeOpacity: 1, strokeWeight: 6, zIndex: 4 });
    lines.current = [glow, pen];
    return () => {
      glow.setMap(null);
      pen.setMap(null);
      lines.current = [];
    };
  }, [map, maps, color]);
  useEffect(() => {
    for (const l of lines.current) l.setPath(path);
  }, [path]);
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
      // (A newly picked place: only one next to where the phone had you.)
      const far = real ? await pickIsNear({ visitId: visit.id }, real) : null;
      if (far) return setMessage(far);
      // (Picking one of your places keeps its name, unless you typed a new one: "Home!" stays.)
      const ownArg = own.trim() !== startOwn.trim() || real?.kind === "real" ? own : null;
      const res = await setStopPlace(visit.id, ownArg, pick);
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

// A line through dots the map couldn't match to real paths, drawn as a smooth curve: a dot that
// juts out and comes back by no more than its own accuracy is GPS noise, not you, so it's left
// out; then the corners are rounded off (Chaikin: each corner cut at a quarter of the way along
// both sides, twice). good: dots you can trust (smoothed a little first, as before).
function curve(dots: Dot[], good = false): Spot[] {
  let pts = dots;
  for (let pass = 0; pass < 3; pass++) {
    const next: Dot[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = next[next.length - 1];
      const b = pts[i];
      const c = pts[i + 1];
      if (a && c && offLine(b, a, c) <= (b.acc ?? 10) && turn(a, b, c) > 80) continue;
      next.push(b);
    }
    if (next.length === pts.length) break;
    pts = next;
  }
  let path: Spot[] = pts.map((d) => ({ lat: d.lat, lng: d.lng }));
  if (good) path = smooth(path);
  for (let n = 0; n < 2 && path.length >= 3; n++) {
    const out: Spot[] = [path[0]];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      if (i > 1) out.push({ lat: a.lat * 0.75 + b.lat * 0.25, lng: a.lng * 0.75 + b.lng * 0.25 });
      if (i < path.length - 1) out.push({ lat: a.lat * 0.25 + b.lat * 0.75, lng: a.lng * 0.25 + b.lng * 0.75 });
    }
    out.push(path[path.length - 1]);
    path = out;
  }
  return path;
}
// How far p is from the line a-b (metres), and how sharply a path turns at b (degrees: 0 straight on, 180 straight back).
function offLine(p: Spot, a: Spot, b: Spot) {
  const k = Math.cos((p.lat * Math.PI) / 180) * 111_320;
  const ax = (a.lng - p.lng) * k, ay = (a.lat - p.lat) * 110_540; // prettier-ignore
  const bx = (b.lng - p.lng) * k, by = (b.lat - p.lat) * 110_540; // prettier-ignore
  const dx = bx - ax, dy = by - ay; // prettier-ignore
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}
function turn(a: Spot, b: Spot, c: Spot) {
  const k = Math.cos((b.lat * Math.PI) / 180);
  const h1 = Math.atan2(b.lat - a.lat, (b.lng - a.lng) * k);
  const h2 = Math.atan2(c.lat - b.lat, (c.lng - b.lng) * k);
  return Math.abs((((h2 - h1) * 180) / Math.PI + 540) % 360 - 180);
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
