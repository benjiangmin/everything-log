"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { APIProvider, InfoWindow, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { namePlace, rememberedRoute } from "@/app/mbm/actions";
import type { RoutePoint, Visit } from "@/mbm/data";
import { clock } from "@/mbm/time";
import { HtmlMarker, KEY, stylesFor } from "./mapBits";
import { buildTrips, decodePolyline, metres, type Piece, type Spot, type Trip } from "@/mbm/trips";

// The stretch you're hovering on the day bar. moving: light up the route (Commute); still: the
// stop you were at (everything else); any: both (untracked time).
export type Focus = { start: number; end: number; kind: "moving" | "still" | "any" };

// The day on a map: each stop, and the trips between them (from the iPhone's dots). Stops are
// labelled with their name (yours, or the one the phone found, like "Noland Hall"). Click a stop to rename it; later
// visits there get the name by themselves. Hovering the day bar highlights where you were then.
export default function DayMapInner({ visits, points, tz, focus }: { visits: Visit[]; points: RoutePoint[]; tz: string; focus: Focus | null }) {
  const [open, setOpen] = useState<Visit | null>(null);
  const [zoom, setZoom] = useState(15);
  const built = useMemo(() => buildTrips(visits, points), [visits, points]);
  const trips = useFilledTrips(built);
  // What lights up for the hovered stretch: the trips (moving) or the stops (still) during it.
  const lit = useMemo(() => {
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
  const nothingLit = lit !== null && lit.stops.size === 0 && lit.trip.size === 0;
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
    <APIProvider apiKey={KEY}>
      <Map
        styles={stylesFor(zoom)}
        onZoomChanged={(e) => setZoom(e.detail.zoom)}
        defaultCenter={all[0] ?? { lat: 43.0731, lng: -89.4012 }}
        defaultZoom={15}
        gestureHandling="cooperative"
        disableDefaultUI
        zoomControl
        clickableIcons={false}
        className="size-full"
      >
        <FitTo spots={all} />
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
        {visits.map((v) => {
          const name = v.place ?? v.auto_name;
          const on = lit?.stops.has(v.id) ?? false;
          const dim = dimming && !on;
          return (
            <HtmlMarker key={v.id} position={{ lat: v.lat, lng: v.lng }} zIndex={on ? 3 : 1}>
              <button
                type="button"
                onClick={() => setOpen(v)}
                title={name ?? "Unnamed stop"}
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
            <NameStop key={open.id} visit={open} tz={tz} onDone={() => setOpen(null)} />
          </InfoWindow>
        )}
      </Map>
      {nothingLit && (
        <p className="pointer-events-none absolute left-3 top-3 rounded-full bg-paper/95 px-3 py-1 text-xs text-muted shadow-sm ring-1 ring-line">
          {focus?.kind === "moving" ? "No route recorded then" : "No location recorded then"}
        </p>
      )}
    </APIProvider>
  );
}

// Bits the phone missed, filled in: a whole missed trip uses a walk you recorded before between
// the same two places; otherwise (and for gaps in the middle of a trip) Google's walking route.
// Still drawn dashed. Google's answers are kept in this browser, so each is only asked for once.
function useFilledTrips(trips: Trip[]): Trip[] {
  const [filled, setFilled] = useState<Record<string, Spot[]>>({});
  const asked = useRef(new Set<string>());
  useEffect(() => {
    let live = true;
    for (const t of trips) {
      t.pieces.forEach((p, i) => {
        const key = `${t.key}:${i}`;
        if (!p.missing || asked.current.has(key)) return;
        const a = p.path[0];
        const b = p.path[p.path.length - 1];
        if (metres(a, b) < 120) return; // short: a straight dash is fine
        asked.current.add(key);
        const whole = t.pieces.length === 1 && t.fromId && t.toId;
        (async () => {
          let path = whole ? await rememberedRoute(t.fromId!, t.toId!).catch(() => null) : null;
          if (path) path = [a, ...path, b];
          else path = await walkingRoute(a, b);
          if (live && path && path.length >= 2) setFilled((f) => ({ ...f, [key]: path! }));
        })();
      });
    }
    return () => {
      live = false;
    };
  }, [trips]);
  return useMemo(
    () => trips.map((t) => ({ ...t, pieces: t.pieces.map((p, i) => (filled[`${t.key}:${i}`] ? { ...p, path: filled[`${t.key}:${i}`] } : p)) })),
    [trips, filled],
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

function NameStop({ visit, tz, onDone }: { visit: Visit; tz: string; onDone: () => void }) {
  const [name, setName] = useState(visit.place ?? visit.auto_name ?? "");
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
      {message && <p className="text-xs text-[#a3473a]">{message}</p>}
    </form>
  );
}
