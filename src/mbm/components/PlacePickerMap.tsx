"use client";

import { useState } from "react";
import { APIProvider, Map } from "@vis.gl/react-google-maps";
import type { PlaceLite } from "@/app/mbm/actions";
import type { Spot } from "@/mbm/trips";
import { HtmlMarker, KEY, stylesFor } from "./mapBits";

// Click the map where it was, name it, save. Your places show as small dots (click one to use it).
export default function PlacePickerMap({
  center,
  places,
  onPickPlace,
  onCreate,
  busy,
}: {
  center: Spot | null;
  places: PlaceLite[];
  onPickPlace: (id: string) => void;
  onCreate: (name: string, lat: number, lng: number) => void;
  busy: boolean;
}) {
  const [pin, setPin] = useState<Spot | null>(null);
  const [name, setName] = useState("");
  const [zoom, setZoom] = useState(17);
  if (!KEY) return <p className="text-xs text-muted">Add NEXT_PUBLIC_GOOGLE_MAPS_KEY to pick on the map.</p>;

  return (
    <div className="flex flex-col gap-2">
      <div className="isolate h-56 overflow-hidden rounded-control ring-1 ring-line">
        <APIProvider apiKey={KEY}>
          <Map
            styles={stylesFor(zoom)}
            onZoomChanged={(e) => setZoom(e.detail.zoom)}
            defaultCenter={center ?? { lat: 43.0731, lng: -89.4012 }}
            defaultZoom={17}
            gestureHandling="greedy"
            disableDefaultUI
            zoomControl
            clickableIcons={false}
            draggableCursor="crosshair"
            onClick={(e) => {
              const at = e.detail.latLng;
              if (at) setPin({ lat: at.lat, lng: at.lng });
            }}
            className="size-full"
          >
            {places.map((p) => (
              <HtmlMarker key={p.id} position={p} zIndex={1}>
                <button
                  type="button"
                  onClick={() => onPickPlace(p.id)}
                  title={`Use ${p.name}`}
                  className="flex flex-col items-center"
                >
                  <span className="mb-0.5 whitespace-nowrap rounded-full bg-[#faf6f0] px-1.5 py-px text-[10px] font-semibold text-[#3e281b] ring-1 ring-[#3e281b]/30">
                    {p.name}
                  </span>
                  <span className="block size-2.5 rounded-full border-2 border-[#3e281b] bg-[#faf6f0]" />
                </button>
              </HtmlMarker>
            ))}
            {pin && (
              <HtmlMarker position={pin} zIndex={2}>
                <span className="block size-4 rounded-full border-2 border-[#faf6f0] bg-[#d4a373] shadow ring-2 ring-[#3e281b]" />
              </HtmlMarker>
            )}
          </Map>
        </APIProvider>
      </div>
      {pin ? (
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            autoFocus
            placeholder="Name it (Morgridge Hall…)"
            aria-label="Place name"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault(); // not the entry's own form
                if (name.trim()) onCreate(name, pin.lat, pin.lng);
              }
            }}
            className="min-w-0 flex-1 rounded-control border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-ink"
            style={{ outline: "none" }}
          />
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => onCreate(name, pin.lat, pin.lng)}
            className="rounded-control bg-accent px-3 text-sm font-semibold text-accent-ink disabled:opacity-50"
          >
            Save
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted">Click where it was.</p>
      )}
    </div>
  );
}
