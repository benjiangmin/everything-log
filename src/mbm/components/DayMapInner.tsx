"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { APIProvider, InfoWindow, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { namePlace } from "@/app/mbm/actions";
import type { RoutePoint, Visit } from "@/mbm/data";
import { clock } from "@/mbm/time";

// Google Maps. The key is meant to be in the page (the browser loads the map with it), so it's a
// NEXT_PUBLIC_ variable, unlike the site's secret keys. Lock it to your site in Google Cloud.
const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

type Spot = { lat: number; lng: number };
export type Focus = { start: number; end: number }; // the stretch you're hovering on the day bar

// Fewer labels when zoomed out; more come back as you zoom in. (Styled here in code, so no Map ID
// is needed: NEXT_PUBLIC_GOOGLE_MAP_ID isn't used any more.)
const QUIET: google.maps.MapTypeStyle[] = [
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "road.local", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.neighborhood", elementType: "labels", stylers: [{ visibility: "off" }] },
];
const CALM: google.maps.MapTypeStyle[] = [
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "poi", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
];
const stylesFor = (zoom: number) => (zoom < 16 ? QUIET : zoom < 18 ? CALM : []);

// The route as lines, broken wherever there's a long gap (so it doesn't draw a straight line across town).
function split(points: RoutePoint[]): Spot[][] {
  const out: Spot[][] = [];
  let prev: RoutePoint | null = null;
  for (const p of points) {
    if (!prev || +new Date(p.at) - +new Date(prev.at) > 20 * 60000) out.push([]);
    out[out.length - 1].push({ lat: p.lat, lng: p.lng });
    prev = p;
  }
  return out;
}

// The day on a map: the route you took (the iPhone's dots) and each stop, labelled with its name
// (yours, or the one the phone found, like "Noland Hall"). Click a stop to rename it; later
// visits there get the name by themselves. Hovering the day bar highlights where you were then.
export default function DayMapInner({ visits, points, tz, focus }: { visits: Visit[]; points: RoutePoint[]; tz: string; focus: Focus | null }) {
  const [open, setOpen] = useState<Visit | null>(null);
  const [zoom, setZoom] = useState(15);
  const segments = useMemo(() => split(points), [points]);
  // What was happening during the hovered stretch: that part of the route, and the stops.
  const lit = useMemo(() => {
    if (!focus) return null;
    const inside = points.filter((p) => {
      const t = +new Date(p.at);
      return t >= focus.start && t <= focus.end;
    });
    const stops = new Set(
      visits
        .filter((v) => +new Date(v.arrived_at) < focus.end && (v.departed_at ? +new Date(v.departed_at) : Infinity) > focus.start)
        .map((v) => v.id),
    );
    return { route: split(inside), stops };
  }, [focus, points, visits]);
  const nothingLit = lit !== null && lit.stops.size === 0 && lit.route.every((r) => r.length < 2);
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
        {segments.map((seg, i) => (
          <Route key={i} path={seg} faded={lit !== null && !nothingLit} />
        ))}
        {lit?.route.map((seg, i) => (
          <Route key={`lit${i}`} path={seg} lit />
        ))}
        {visits.map((v) => {
          const name = v.place ?? v.auto_name;
          const on = lit?.stops.has(v.id) ?? false;
          const dim = lit !== null && !nothingLit && !on;
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
          No location recorded then
        </p>
      )}
    </APIProvider>
  );
}

// The route as a mocha line. Lit = the hovered stretch (thicker, caramel); faded = the rest of the day while hovering.
function Route({ path, lit = false, faded = false }: { path: Spot[]; lit?: boolean; faded?: boolean }) {
  const map = useMap();
  const maps = useMapsLibrary("maps");
  useEffect(() => {
    if (!map || !maps) return;
    const line = new maps.Polyline({
      path,
      map,
      clickable: false,
      strokeColor: lit ? "#d4a373" : "#7f5539",
      strokeOpacity: lit ? 1 : faded ? 0.3 : 0.85,
      strokeWeight: lit ? 7 : 4,
      zIndex: lit ? 2 : 1,
    });
    return () => line.setMap(null);
  }, [map, maps, path, lit, faded]);
  return null;
}

// A bit of the page pinned to a spot on the map (its bottom-middle sits on the spot).
function HtmlMarker({ position, zIndex, children }: { position: Spot; zIndex: number; children: ReactNode }) {
  const map = useMap();
  const maps = useMapsLibrary("maps");
  const [el] = useState(() => {
    const d = document.createElement("div");
    d.style.position = "absolute";
    return d;
  });
  const { lat, lng } = position;
  useEffect(() => {
    if (!map || !maps) return;
    const o = new maps.OverlayView();
    o.onAdd = () => o.getPanes()?.overlayMouseTarget.appendChild(el);
    o.draw = () => {
      const p = o.getProjection()?.fromLatLngToDivPixel({ lat, lng });
      if (!p) return;
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
    };
    o.onRemove = () => el.remove();
    maps.OverlayView.preventMapHitsAndGesturesFrom(el);
    o.setMap(map);
    return () => o.setMap(null);
  }, [map, maps, el, lat, lng]);
  // (el has no z-index of its own, so this one stacks the markers against each other.)
  return createPortal(<div style={{ position: "relative", zIndex, transform: "translate(-50%, -100%)" }}>{children}</div>, el);
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
