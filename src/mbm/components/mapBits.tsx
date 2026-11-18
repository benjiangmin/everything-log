"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import type { Spot } from "@/mbm/trips";

// Shared by the day map and the place picker.

// Google Maps. The key is meant to be in the page (the browser loads the map with it), so it's a
// NEXT_PUBLIC_ variable, unlike the site's secret keys. Lock it to your site in Google Cloud.
export const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

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
// The warm look, at every zoom: cream land, pale tan roads (light enough that your mocha routes
// stand out on them), soft blue water, sage parks, warm grey text. Labels per zoom on top.
const WARM: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#f6efe4" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#7d6957" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#faf6f0" }] },
  { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#f1e7d8" }] },
  { featureType: "landscape.man_made", elementType: "geometry.stroke", stylers: [{ color: "#e4d6c2" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#f3ead9" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#efe5d4" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#dfe6cc" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6c8757" }] },
  { featureType: "poi.school", elementType: "geometry", stylers: [{ color: "#efe3cf" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#fffaf2" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#e3d3bd" }] },
  { featureType: "road.arterial", elementType: "geometry.fill", stylers: [{ color: "#fbf2e4" }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#f2dfc4" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#dcc4a3" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8f7a66" }] },
  { featureType: "transit.line", elementType: "geometry", stylers: [{ color: "#e6d8c4" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#bcd5dc" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#6f8f99" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#d9c8b1" }] },
];
const FAR = [...WARM, ...QUIET];
const MID = [...WARM, ...CALM];
export const stylesFor = (zoom: number) => (zoom < 16 ? FAR : zoom < 18 ? MID : WARM); // (the same arrays each time, so the map isn't restyled on every render)

// A bit of the page pinned to a spot on the map (its bottom-middle sits on the spot). `passive`:
// just a picture (like the you-are-here dot): the pointer goes straight through to the map, so
// it never gets in the way of hovering, clicking, dragging or scrolling.
export function HtmlMarker({ position, zIndex, children, passive = false }: { position: Spot; zIndex: number; children: ReactNode; passive?: boolean }) {
  const map = useMap();
  const maps = useMapsLibrary("maps");
  const [el] = useState(() => {
    const d = document.createElement("div");
    d.style.position = "absolute";
    if (passive) d.style.pointerEvents = "none";
    return d;
  });
  const { lat, lng } = position;
  useEffect(() => {
    if (!map || !maps) return;
    const o = new maps.OverlayView();
    o.onAdd = () => (passive ? o.getPanes()?.overlayLayer : o.getPanes()?.overlayMouseTarget)?.appendChild(el);
    o.draw = () => {
      const p = o.getProjection()?.fromLatLngToDivPixel({ lat, lng });
      if (!p) return;
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
    };
    o.onRemove = () => el.remove();
    if (!passive) maps.OverlayView.preventMapHitsAndGesturesFrom(el);
    o.setMap(map);
    return () => o.setMap(null);
  }, [map, maps, el, lat, lng, passive]);
  // (el has no z-index of its own, so this one stacks the markers against each other.)
  return createPortal(<div style={{ position: "relative", zIndex, transform: "translate(-50%, -100%)" }}>{children}</div>, el);
}
