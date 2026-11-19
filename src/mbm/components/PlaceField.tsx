"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { APIProvider, useMapsLibrary } from "@vis.gl/react-google-maps";
import { KEY } from "./mapBits";

// A place, as you type: your own places first (Theory, Morgridge…), then Google's suggestions
// (Places API (New): turn it on for the Maps key). Picking one keeps where it is too.
export type Picked = { text: string; placeId: string | null; lat: number | null; lng: number | null };
type Mine = { id: string; name: string; lat: number; lng: number };

export default function PlaceField(props: { value: Picked; onChange: (p: Picked) => void; places: Mine[]; className?: string }) {
  return (
    <APIProvider apiKey={KEY ?? ""}>
      <Field {...props} />
    </APIProvider>
  );
}

function Field({ value, onChange, places, className = "" }: { value: Picked; onChange: (p: Picked) => void; places: Mine[]; className?: string }) {
  const lib = useMapsLibrary("places");
  const token = useMemo(() => (lib ? new lib.AutocompleteSessionToken() : null), [lib]);
  const [open, setOpen] = useState(false);
  const [google, setGoogle] = useState<{ id: string; main: string; rest: string; prediction: google.maps.places.PlacePrediction }[]>([]);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const q = value.text.trim().toLowerCase();
  const mine = q ? places.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 4) : [];

  // Google's suggestions, a moment after you stop typing (near Madison first).
  useEffect(() => {
    if (!lib || !token || q.length < 2 || value.placeId) return;
    let live = true;
    const t = setTimeout(async () => {
      try {
        const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: value.text,
          sessionToken: token,
          locationBias: { center: { lat: places[0]?.lat ?? 43.0731, lng: places[0]?.lng ?? -89.4012 }, radius: 30000 },
        });
        if (!live) return;
        setGoogle(
          suggestions
            .map((s) => s.placePrediction)
            .filter((p): p is google.maps.places.PlacePrediction => !!p)
            .slice(0, 5)
            .map((p) => ({ id: p.placeId, main: p.mainText?.toString() ?? p.text.toString(), rest: p.secondaryText?.toString() ?? "", prediction: p })),
        );
      } catch {
        if (live) setGoogle([]);
      }
    }, 220);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [lib, token, q, value.text, value.placeId, places]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const options: { key: string; main: string; rest: string; pick: () => void }[] = [
    ...mine.map((p) => ({ key: `m${p.id}`, main: p.name, rest: "Your place", pick: () => choose({ text: p.name, placeId: null, lat: p.lat, lng: p.lng }) })),
    ...google
      .filter((g) => !mine.some((m) => m.name.toLowerCase() === g.main.toLowerCase()))
      .map((g) => ({
        key: g.id,
        main: g.main,
        rest: g.rest,
        pick: async () => {
          const place = g.prediction.toPlace();
          try {
            await place.fetchFields({ fields: ["displayName", "formattedAddress", "location"] });
          } catch {}
          const name = place.displayName ?? g.main;
          const address = place.formattedAddress ?? g.rest;
          choose({ text: address && !address.startsWith(name) ? `${name}, ${address}` : name || address, placeId: g.id, lat: place.location?.lat() ?? null, lng: place.location?.lng() ?? null });
        },
      })),
  ];

  function choose(p: Picked) {
    onChange(p);
    setOpen(false);
    setGoogle([]);
  }

  return (
    <div ref={box} className="relative">
      <input
        value={value.text}
        onChange={(e) => {
          onChange({ text: e.target.value, placeId: null, lat: null, lng: null });
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || !options.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(options.length - 1, a + 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          }
          if (e.key === "Enter") {
            e.preventDefault();
            void options[active]?.pick();
          }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Add a location"
        className={className}
        style={{ outline: "none" }}
      />
      {open && options.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-control border border-line bg-paper py-1 shadow-xl shadow-ink/15">
          {options.map((o, i) => (
            <li key={o.key}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => void o.pick()}
                className={`flex w-full items-start gap-2.5 px-3 py-2 text-left text-sm ${i === active ? "bg-surface" : ""}`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-0.5 shrink-0 text-muted">
                  <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" stroke="currentColor" strokeWidth="2" />
                  <circle cx="12" cy="9.5" r="2.5" stroke="currentColor" strokeWidth="2" />
                </svg>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{o.main}</span>
                  {o.rest && <span className="block truncate text-xs text-muted">{o.rest}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
