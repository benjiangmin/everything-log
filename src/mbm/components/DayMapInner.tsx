"use client";

import { useEffect, useState, useTransition } from "react";
import { AdvancedMarker, APIProvider, InfoWindow, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { namePlace } from "@/app/mbm/actions";
import type { RoutePoint, Visit } from "@/mbm/data";
import { clock } from "@/mbm/time";

// Google Maps. Both are meant to be in the page (the browser loads the map with them), so they're
// NEXT_PUBLIC_ variables, unlike the site's secret keys. Lock the key to your site in Google Cloud.
const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID"; // a Map ID allows styling it in Google Cloud

type Spot = { lat: number; lng: number };

// The day on a map: the route you took (the iPhone's dots) and each stop, labelled with its name
// (yours, or the one the phone found, like "Noland Hall"). Click a stop to rename it; later
// visits there get the name by themselves.
export default function DayMapInner({ visits, points, tz }: { visits: Visit[]; points: RoutePoint[]; tz: string }) {
  const [open, setOpen] = useState<Visit | null>(null);
  if (!KEY) {
    return (
      <p className="grid size-full place-items-center px-6 text-center text-sm text-muted">
        Add NEXT_PUBLIC_GOOGLE_MAPS_KEY to show the map.
      </p>
    );
  }

  // The route, broken wherever there's a long gap (so it doesn't draw a straight line across town).
  const segments: Spot[][] = [];
  let prev: RoutePoint | null = null;
  for (const p of points) {
    if (!prev || +new Date(p.at) - +new Date(prev.at) > 20 * 60000) segments.push([]);
    segments[segments.length - 1].push({ lat: p.lat, lng: p.lng });
    prev = p;
  }
  const all: Spot[] = [...points, ...visits].map((s) => ({ lat: s.lat, lng: s.lng }));

  return (
    <APIProvider apiKey={KEY}>
      <Map
        mapId={MAP_ID}
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
          <Route key={i} path={seg} />
        ))}
        {visits.map((v) => {
          const name = v.place ?? v.auto_name;
          return (
            <AdvancedMarker key={v.id} position={{ lat: v.lat, lng: v.lng }} onClick={() => setOpen(v)} title={name ?? "Unnamed stop"}>
              <div className="flex flex-col items-center">
                {name && (
                  <span
                    className={`mb-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm ${
                      v.place ? "bg-[#3e281b] text-[#faf6f0]" : "bg-[#faf6f0] text-[#3e281b] ring-1 ring-[#3e281b]/30"
                    }`}
                  >
                    {name}
                  </span>
                )}
                <span className={`block size-4 rounded-full border-2 border-[#3e281b] shadow ${v.place ? "bg-[#faf6f0]" : "bg-[#d4a373]"}`} />
              </div>
            </AdvancedMarker>
          );
        })}
        {open && (
          <InfoWindow position={{ lat: open.lat, lng: open.lng }} pixelOffset={[0, -28]} onCloseClick={() => setOpen(null)} headerDisabled>
            <NameStop key={open.id} visit={open} tz={tz} onDone={() => setOpen(null)} />
          </InfoWindow>
        )}
      </Map>
    </APIProvider>
  );
}

// The route as a mocha line.
function Route({ path }: { path: Spot[] }) {
  const map = useMap();
  const maps = useMapsLibrary("maps");
  useEffect(() => {
    if (!map || !maps) return;
    const line = new maps.Polyline({ path, map, strokeColor: "#7f5539", strokeOpacity: 0.85, strokeWeight: 4 });
    return () => line.setMap(null);
  }, [map, maps, path]);
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
