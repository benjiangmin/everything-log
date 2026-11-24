"use client";

import { useEffect, useRef } from "react";
import { APIProvider, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { HtmlMarker, KEY, MAP_GROUND, stylesFor } from "./mapBits";
import { clock } from "@/mbm/time";

type Stop = { arrived: string; departed: string | null; lat: number; lng: number; name: string | null };

// A friend's day on the map (trusted friends, when they share it): their route and named stops.
export default function FriendMap({ stops, route, tz }: { stops: Stop[]; route: [number, number, string][]; tz: string }) {
  if (!KEY) return <p className="rounded-card bg-surface px-5 py-4 text-sm text-muted">The map needs NEXT_PUBLIC_GOOGLE_MAPS_KEY.</p>;
  if (!stops.length && !route.length) return <p className="rounded-card bg-surface px-5 py-4 text-sm text-muted">No places yet.</p>;
  const all = [...stops.map((s) => [s.lat, s.lng]), ...route.map((r) => [r[0], r[1]])];
  const center = { lat: all.reduce((t, p) => t + p[0], 0) / all.length, lng: all.reduce((t, p) => t + p[1], 0) / all.length };
  return (
    <div className="h-96 overflow-hidden rounded-card ring-1 ring-line">
      <APIProvider apiKey={KEY}>
        <Map defaultCenter={center} defaultZoom={14} gestureHandling="cooperative" disableDefaultUI clickableIcons={false} styles={stylesFor(14)} backgroundColor={MAP_GROUND.day} className="size-full">
          <Fit points={all} />
          <Route route={route} />
          {stops.map((s, i) => (
            // (HtmlMarker puts the bottom middle on the spot; the label floats above the dot,
            // so the dot's middle is on it.)
            <HtmlMarker key={i} position={{ lat: s.lat, lng: s.lng }} zIndex={5}>
              <span className="group relative block size-3.5 translate-y-1/2 cursor-default rounded-full border-2 border-paper bg-ink shadow" aria-label={`${s.name ?? "Stop"} · ${clock(s.arrived, tz)}`}>
                <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-2.5 py-1 text-xs font-semibold text-paper shadow-md group-hover:block">
                  {s.name ?? "Stop"} · {clock(s.arrived, tz)}
                  {s.departed ? ` – ${clock(s.departed, tz)}` : ""}
                </span>
              </span>
            </HtmlMarker>
          ))}
        </Map>
      </APIProvider>
    </div>
  );
}

function Fit({ points }: { points: number[][] }) {
  const map = useMap();
  const core = useMapsLibrary("core");
  const done = useRef(false);
  // Once: after that the map stays where you move it (the page re-renders every minute).
  useEffect(() => {
    if (!map || !core || points.length < 2 || done.current) return;
    done.current = true;
    const b = new core.LatLngBounds();
    for (const p of points) b.extend({ lat: p[0], lng: p[1] });
    map.fitBounds(b, 48);
  }, [map, core, points]);
  return null;
}

function Route({ route }: { route: [number, number, string][] }) {
  const map = useMap();
  const maps = useMapsLibrary("maps");
  useEffect(() => {
    if (!map || !maps || route.length < 2) return;
    const line = new maps.Polyline({ path: route.map((r) => ({ lat: r[0], lng: r[1] })), strokeColor: "#8a5a3c", strokeOpacity: 0.85, strokeWeight: 4, map });
    return () => line.setMap(null);
  }, [map, maps, route]);
  return null;
}
