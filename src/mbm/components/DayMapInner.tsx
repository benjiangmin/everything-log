"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useState, useTransition } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { LatLngTuple } from "leaflet";
import { namePlace } from "@/app/mbm/actions";
import type { RoutePoint, Visit } from "@/mbm/data";
import { clock } from "@/mbm/time";

// The day on a map: the route you took (from the iPhone's dots) and each stop. Named stops show
// their name; click any stop to name it (later visits there get the name by themselves).
export default function DayMapInner({ visits, points, tz }: { visits: Visit[]; points: RoutePoint[]; tz: string }) {
  // The route, broken wherever there's a long gap (so it doesn't draw a straight line across town).
  const segments: LatLngTuple[][] = [];
  let prev: RoutePoint | null = null;
  for (const p of points) {
    if (!prev || +new Date(p.at) - +new Date(prev.at) > 20 * 60000) segments.push([]);
    segments[segments.length - 1].push([p.lat, p.lng]);
    prev = p;
  }
  const all: LatLngTuple[] = [...points.map((p) => [p.lat, p.lng] as LatLngTuple), ...visits.map((v) => [v.lat, v.lng] as LatLngTuple)];

  return (
    <MapContainer center={all[0] ?? [43.0731, -89.4012]} zoom={15} scrollWheelZoom={false} className="size-full" attributionControl>
      {/* OpenStreetMap's own map (free, no key; fine for personal use). Softened toward the
          site's colors with the "mbm-map" filter in globals.css. */}
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        className="mbm-map"
      />
      <FitTo spots={all} />
      {segments.map((seg, i) => (
        <Polyline key={i} positions={seg} pathOptions={{ color: "#7f5539", weight: 4, opacity: 0.8 }} />
      ))}
      {visits.map((v) => (
        <CircleMarker
          key={v.id}
          center={[v.lat, v.lng]}
          radius={9}
          pathOptions={{ color: "#3e281b", weight: 2, fillColor: v.place ? "#faf6f0" : "#d4a373", fillOpacity: 1 }}
        >
          <Tooltip direction="top" offset={[0, -8]} permanent={Boolean(v.place)}>
            <span className="font-semibold">{v.place ?? "Unnamed stop"}</span>
            {!v.place && (
              <span className="block text-[11px]">
                {clock(v.arrived_at, tz)} – {v.departed_at ? clock(v.departed_at, tz) : "now"} · click to name
              </span>
            )}
          </Tooltip>
          <Popup>
            <NameStop visit={v} tz={tz} />
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

// Zooms to show the whole day (once, when the data first arrives).
function FitTo({ spots }: { spots: LatLngTuple[] }) {
  const map = useMap();
  const key = spots.length;
  useEffect(() => {
    // The map's box may still be settling (it loads after the page): measure, then fit.
    const fit = () => {
      map.invalidateSize();
      if (spots.length === 1) map.setView(spots[0], 16);
      else if (spots.length > 1) map.fitBounds(spots, { padding: [36, 36], maxZoom: 17 });
    };
    fit();
    const t = setTimeout(fit, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the number of spots changes
  }, [map, key]);
  return null;
}

function NameStop({ visit, tz }: { visit: Visit; tz: string }) {
  const [name, setName] = useState(visit.place ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, run] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        run(async () => {
          const res = await namePlace(visit.id, name);
          if (!res.ok) setMessage(res.message);
          else setMessage("Saved.");
        });
      }}
      className="flex w-56 flex-col gap-2 font-sans"
    >
      <p className="text-xs text-[#86705f]">
        {clock(visit.arrived_at, tz)} – {visit.departed_at ? clock(visit.departed_at, tz) : "now"}
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name this place (Home, Theory…)"
        maxLength={80}
        autoFocus
        className="rounded-[10px] border border-[#e2d5c4] bg-[#faf6f0] px-2.5 py-2 text-sm text-[#2b1c14] outline-none focus:border-[#2b1c14]"
      />
      <button type="submit" disabled={pending || !name.trim()} className="rounded-[10px] bg-[#3e281b] py-2 text-sm font-semibold text-[#faf6f0] disabled:opacity-50">
        {pending ? "Saving…" : "Save"}
      </button>
      {message && <p className="text-xs text-[#86705f]">{message}</p>}
    </form>
  );
}
