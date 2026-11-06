"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { APIProvider, InfoWindow, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { moveStop, namePlace, rememberedRoute, removeStop } from "@/app/mbm/actions";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import type { Activity, Block, RoutePoint, Visit } from "@/mbm/data";
import { clock, span } from "@/mbm/time";
import { HtmlMarker, KEY, stylesFor } from "./mapBits";
import { buildTrips, decodePolyline, metres, type Piece, type Spot, type Trip } from "@/mbm/trips";
import { snapTrip } from "@/mbm/snap";
import { isMoving } from "@/mbm/moving";

// The stretch you're hovering on the day bar. moving: light up the route (Commute); still: the
// stop you were at (everything else); any: both (untracked time).
export type Focus = { start: number; end: number; kind: "moving" | "still" | "any" };

// The day on a map: each stop, and the trips between them (from the iPhone's dots). Stops are
// labelled with their name (yours, or the one the phone found, like "Noland Hall"). Click a stop to rename it; later
// visits there get the name by themselves. Hovering the day bar highlights where you were then.
export default function DayMapInner({
  visits,
  points,
  tz,
  focus,
  showDots = false,
  liveColor = null,
  blocks = [],
  activities = [],
  onPointer,
  gestures = "cooperative",
}: {
  gestures?: "cooperative" | "greedy";
  visits: Visit[];
  points: RoutePoint[];
  blocks?: Block[];
  activities?: Activity[];
  onPointer?: (spans: { start: number; end: number }[] | null) => void; // what you're pointing at, for the day bar
  tz: string;
  focus: Focus | null;
  showDots?: boolean; // every recorded dot, to see what the phone actually got
  liveColor?: string | null; // today: show where you are now, pulsing, in this color
}) {
  const [open, setOpen] = useState<Visit | null>(null);
  const [moving, setMoving] = useState<Visit | null>(null); // "click where it really is"
  const [moveNote, setMoveNote] = useState<string | null>(null);
  const [, runMove] = useTransition();
  const [zoom, setZoom] = useState(15);
  // What the pointer is on: trips under it (several, where paths overlap) or a stop.
  const [pointed, setPointed] = useState<{ trips: string[]; stops: string[]; x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const built = useMemo(() => buildTrips(visits, points), [visits, points]);
  const trips = useFilledTrips(built);
  // What lights up for the hovered stretch: the trips (moving) or the stops (still) during it.
  const barLit = useMemo(() => {
    if (!focus) return null;
    const overlaps = (a: number, b: number) => a < focus.end && b > focus.start;
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
    setPointed(p);
    if (!onPointer) return;
    if (!p) return onPointer(null);
    const spans = [
      ...trips.filter((t) => p.trips.includes(t.key)).map((t) => ({ start: t.start, end: t.end })),
      ...visits
        .filter((v) => p.stops.includes(v.id))
        .map((v) => ({ start: +new Date(v.arrived_at), end: v.departed_at ? +new Date(v.departed_at) : Date.now() })),
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
    if (open && (!last || +new Date(open.arrived_at) >= +new Date(last.at) - 5 * 60000)) return { at: { lat: open.lat, lng: open.lng }, when: null };
    return last ? { at: { lat: last.lat, lng: last.lng }, when: last.at } : null;
  }, [liveColor, points, visits]);
  const nothingLit = !pointed && lit !== null && lit.stops.size === 0 && lit.trip.size === 0;
  const dimming = lit !== null && !nothingLit;
  if (!KEY) {
    return (
      <p className="grid size-full place-items-center px-6 text-center text-sm text-muted">
        Add NEXT_PUBLIC_GOOGLE_MAPS_KEY to show the map.
      </p>
    );
  }

  const all: Spot[] = [...points, ...visits].map((s) => ({ lat: s.lat, lng: s.lng }));

  return (
    <div ref={box} className="relative size-full" onMouseLeave={() => pointed && point(null)}>
    <APIProvider apiKey={KEY}>
      <Map
        styles={stylesFor(zoom)}
        onZoomChanged={(e) => setZoom(e.detail.zoom)}
        defaultCenter={all[0] ?? { lat: 43.0731, lng: -89.4012 }}
        defaultZoom={15}
        gestureHandling={gestures}
        disableDefaultUI
        zoomControl
        clickableIcons={false}
        draggableCursor={moving ? "crosshair" : undefined}
        onClick={(e) => {
          const at = e.detail.latLng;
          if (!moving || !at) return;
          const v = moving;
          setMoving(null);
          runMove(async () => {
            const res = await moveStop(v.id, at.lat, at.lng);
            setMoveNote(res.ok ? null : res.message);
          });
        }}
        className="size-full"
      >
        <FitTo spots={all} />
        <PointerTrack trips={trips} onHit={(hit, e) => point(hit.length ? { trips: hit, stops: [], ...where(e) } : null)} />
        {showDots && <Dots points={points} tz={tz} />}
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
                className={`block size-3 cursor-help rounded-full border-2 border-[#faf6f0] bg-[#7f5539] shadow transition-opacity ${
                  dimming && !lit?.trip.has(t.key) ? "opacity-35" : ""
                }`}
              />
            </HtmlMarker>
          ));
        })}
        {here && liveColor && (
          <HtmlMarker position={here.at} zIndex={here.when ? 4 : 0}>
            <span className="relative grid size-4 place-items-center" title={here.when ? `Last seen here · ${clock(here.when, tz)}` : "You're here"}>
              <span className="absolute inline-flex size-4 animate-ping rounded-full opacity-50" style={{ background: liveColor }} />
              {here.when && <span className="relative size-3.5 rounded-full border-2 border-[#faf6f0] shadow" style={{ background: liveColor }} />}
            </span>
          </HtmlMarker>
        )}
        {visits.map((v) => {
          const name = v.place ?? v.auto_name;
          const on = lit?.stops.has(v.id) ?? false;
          const dim = dimming && !on;
          return (
            <HtmlMarker key={v.id} position={{ lat: v.lat, lng: v.lng }} zIndex={on ? 3 : 1}>
              <button
                type="button"
                onClick={() => setOpen(v)}
                onMouseEnter={(e) => point({ trips: [], stops: [v.id], ...where(e) })}
                onMouseLeave={() => point(null)}
                aria-label={name ?? "Unnamed stop"}
                className={`flex cursor-pointer flex-col items-center transition-[opacity,transform] duration-150 ${dim ? "opacity-35" : ""} ${on ? "scale-125" : ""}`}
                style={{ transformOrigin: "bottom center" }}
              >
                {name && (
                  <span
                    className={`mb-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm ${
                      v.place ? "bg-[#3e281b] text-[#faf6f0]" : "bg-[#faf6f0] text-[#3e281b] ring-1 ring-[#3e281b]/30"
                    }`}
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
            <NameStop
              key={open.id}
              visit={open}
              tz={tz}
              onDone={() => setOpen(null)}
              onMove={() => {
                setMoving(open);
                setOpen(null);
              }}
            />
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
      {nothingLit && !moving && (
        <p className="pointer-events-none absolute left-3 top-3 rounded-full bg-paper/95 px-3 py-1 text-xs text-muted shadow-sm ring-1 ring-line">
          {focus?.kind === "moving" ? "No route recorded then" : "No location recorded then"}
        </p>
      )}
    </APIProvider>
      {pointed && !moving && (
        <Tip
          x={pointed.x}
          y={pointed.y}
          rows={[
            ...trips.filter((t) => pointed.trips.includes(t.key)).map((t) => tripRow(t, blocks, activities, tz)),
            ...visits.filter((v) => pointed.stops.includes(v.id)).map((v) => stopRow(v, tz)),
          ]}
        />
      )}
    </div>
  );
}

type Row = { key: string; color: string; title: string; detail: string };

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
    title: best?.name ?? "Trip (no Commute tracked)",
    detail: `${clock(new Date(t.start), tz)} – ${clock(new Date(t.end), tz)} · ${span(t.end - t.start)}`,
  };
}

function stopRow(v: Visit, tz: string): Row {
  const end = v.departed_at ? +new Date(v.departed_at) : Date.now();
  return {
    key: v.id,
    color: "#faf6f0",
    title: v.place ?? v.auto_name ?? "Unnamed stop",
    detail: `${clock(v.arrived_at, tz)} – ${v.departed_at ? clock(v.departed_at, tz) : "now"} · ${span(end - +new Date(v.arrived_at))}`,
  };
}

// The little speech bubble by the pointer: everything under it (overlapping paths all listed).
function Tip({ x, y, rows }: { x: number; y: number; rows: Row[] }) {
  if (!rows.length) return null;
  const below = y < 40 + rows.length * 40; // near the top of the map: show it under the pointer instead
  return (
    <div
      role="tooltip"
      className={`pointer-events-none absolute z-30 w-max max-w-64 -translate-x-1/2 rounded-card bg-ink px-3 py-2 text-paper shadow-lg ${below ? "" : "-translate-y-full"}`}
      style={{ left: x, top: below ? y + 18 : y - 14 }}
    >
      {rows.length > 1 && <p className="mb-1 text-[11px] text-paper/60">{rows.length} trips here</p>}
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

// Trips drawn as realistically as we can: first snapped onto real walkways and roads (your dots,
// matched to the paths you took; see snap.ts). If that isn't possible, bits the phone missed are
// filled in: a whole missed trip uses a walk you recorded before between the same two places;
// otherwise Google's walking route. Those stay dashed. Answers are kept in this browser.
function useFilledTrips(trips: Trip[]): Trip[] {
  const [filled, setFilled] = useState<Record<string, Spot[]>>({});
  const [snapped, setSnapped] = useState<Record<string, Spot[]>>({});
  const asked = useRef(new Set<string>());
  // (Answers are kept even if the trips change meanwhile: each trip is only asked about once.)
  useEffect(() => {
    for (const t of trips) {
      if (asked.current.has(t.key)) continue;
      asked.current.add(t.key);
      const recorded = t.pieces.some((p) => !p.missing);
      (async () => {
        if (recorded) {
          const path = await snapTrip(t);
          if (path) {
            setSnapped((m) => ({ ...m, [t.key]: path }));
            return;
          }
        }
        // Couldn't snap: fill the missing bits.
        t.pieces.forEach(async (p, i) => {
          if (!p.missing) return;
          const a = p.path[0];
          const b = p.path[p.path.length - 1];
          if (metres(a, b) < 120) return; // short: a straight dash is fine
          const whole = t.pieces.length === 1 && t.fromId && t.toId;
          let path = whole ? await rememberedRoute(t.fromId!, t.toId!).catch(() => null) : null;
          if (path) path = [a, ...path, b];
          else path = await walkingRoute(a, b);
          if (path && path.length >= 2) setFilled((f) => ({ ...f, [`${t.key}:${i}`]: path! }));
        });
      })();
    }
  }, [trips]);
  return useMemo(
    () =>
      trips.map((t) =>
        snapped[t.key]
          ? { ...t, pieces: [{ path: snapped[t.key], missing: false }] }
          : { ...t, pieces: t.pieces.map((p, i) => (filled[`${t.key}:${i}`] ? { ...p, path: filled[`${t.key}:${i}`] } : p)) },
      ),
    [trips, filled, snapped],
  );
}

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

// A trip: solid mocha where the phone recorded the way, dashed where it missed a bit. Lit = the
// hovered stretch (thicker, caramel); faded = the rest of the day while hovering.
function TripLine({ pieces, lit, faded }: { pieces: Piece[]; lit: boolean; faded: boolean }) {
  return pieces.map((p, i) => <Route key={i} path={p.path} dashed={p.missing} lit={lit} faded={faded} />);
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

// Zooms to show the whole day (when the number of spots changes).
function FitTo({ spots }: { spots: Spot[] }) {
  const map = useMap();
  const core = useMapsLibrary("core");
  const key = spots.length;
  useEffect(() => {
    if (!map || !core || spots.length === 0) return;
    if (spots.length === 1) {
      map.setCenter(spots[0]);
      map.setZoom(17);
      return;
    }
    const bounds = new core.LatLngBounds();
    for (const s of spots) bounds.extend(s);
    map.fitBounds(bounds, 48);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the number of spots changes
  }, [map, core, key]);
  return null;
}

function NameStop({ visit, tz, onDone, onMove }: { visit: Visit; tz: string; onDone: () => void; onMove: () => void }) {
  const [name, setName] = useState(visit.place ?? visit.auto_name ?? "");
  const confirm = useConfirm();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, run] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        run(async () => {
          const res = await namePlace(visit.id, name);
          if (res.ok) onDone();
          else setMessage(res.message);
        })
      }}
      className="flex w-60 flex-col gap-2 p-1 font-sans"
    >
      <p className="text-xs text-[#86705f]">
        {clock(visit.arrived_at, tz)} – {visit.departed_at ? clock(visit.departed_at, tz) : "now"}
        {!visit.place && visit.auto_name && " · name found by your phone"}
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name this place (Home, Theory…)"
        maxLength={80}
        autoFocus
        className="rounded-[10px] border border-[#e2d5c4] bg-[#faf6f0] px-2.5 py-2 text-sm text-[#2b1c14] outline-none focus:border-[#2b1c14]"
      />
      <div className="flex gap-2">
        <button type="submit" disabled={pending || !name.trim()} className="flex-1 rounded-[10px] bg-[#3e281b] py-2 text-sm font-semibold text-[#faf6f0] disabled:opacity-50">
          {pending ? "Saving…" : visit.place ? "Rename" : "Save name"}
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
