"use client";

import { useEffect, useMemo, useState } from "react";
import { APIProvider, useMapsLibrary } from "@vis.gl/react-google-maps";
import type { PlacePick } from "@/app/mbm/actions";
import { KEY } from "./mapBits";

// Search for a place: your places first (by your name or the actual place's), then actual places
// from Google (Places API (New), on the Maps key). The results sit under the box, not over it, so
// it works inside the map's popups too.
type Mine = { id: string; name: string; lat: number; lng: number; real_name?: string | null; real_address?: string | null };
export type Found = PlacePick & { label: string; detail: string | null };

export default function PlaceSearch(props: {
  places: Mine[];
  onPick: (p: Found) => void;
  initial?: string; // (e.g. what the phone guessed)
  near?: { lat: number; lng: number } | null;
  placeholder?: string;
  autoFocus?: boolean;
  inputClassName?: string;
  busy?: boolean;
  mineOnly?: boolean; // (just your places: e.g. merging)
}) {
  return (
    <APIProvider apiKey={KEY ?? ""}>
      <Search {...props} />
    </APIProvider>
  );
}

// (Inside the map, which already has Google's script loaded.)
export function Search({
  places,
  onPick,
  initial = "",
  near,
  placeholder = "Search for a place",
  autoFocus = false,
  inputClassName = "w-full rounded-control border border-line bg-paper px-3 py-2.5 text-sm",
  busy = false,
  mineOnly = false,
}: {
  places: Mine[];
  onPick: (p: Found) => void;
  initial?: string;
  near?: { lat: number; lng: number } | null;
  placeholder?: string;
  autoFocus?: boolean;
  inputClassName?: string;
  busy?: boolean;
  mineOnly?: boolean;
}) {
  const lib = useMapsLibrary("places");
  const token = useMemo(() => (lib ? new lib.AutocompleteSessionToken() : null), [lib]);
  const [text, setText] = useState(initial);
  const [google, setGoogle] = useState<{ id: string; main: string; rest: string; prediction: google.maps.places.PlacePrediction }[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const q = text.trim().toLowerCase();
  const mine = q || mineOnly ? places.filter((p) => p.name.toLowerCase().includes(q) || p.real_name?.toLowerCase().includes(q)).slice(0, mineOnly ? 8 : 4) : [];

  // Google's, a moment after you stop typing (near where you were first).
  useEffect(() => {
    if (!lib || !token || q.length < 2 || mineOnly) return;
    let live = true;
    const t = setTimeout(async () => {
      try {
        const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: text,
          sessionToken: token,
          locationBias: { center: near ?? { lat: places[0]?.lat ?? 43.0731, lng: places[0]?.lng ?? -89.4012 }, radius: near ? 3000 : 30000 },
        });
        if (!live) return;
        setProblem(null);
        setGoogle(
          suggestions
            .map((s) => s.placePrediction)
            .filter((p): p is google.maps.places.PlacePrediction => !!p)
            .slice(0, 5)
            .map((p) => ({ id: p.placeId, main: p.mainText?.toString() ?? p.text.toString(), rest: p.secondaryText?.toString() ?? "", prediction: p })),
        );
      } catch {
        if (!live) return;
        setGoogle([]);
        setProblem("Google's places aren't available. Turn on Places API (New) for the Maps key.");
      }
    }, 220);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [lib, token, q, text, near, places, mineOnly]);

  const options: { key: string; main: string; rest: string; yours: boolean; pick: () => void | Promise<void> }[] = [
    ...mine.map((p) => ({
      key: `m${p.id}`,
      main: p.name,
      rest: p.real_name && p.real_name !== p.name ? p.real_name : (p.real_address ?? "Your place"),
      yours: true,
      pick: () => onPick({ kind: "mine", id: p.id, label: p.name, detail: p.real_name ?? null }),
    })),
    ...(q.length >= 2 && !mineOnly ? google : [])
      .filter((g) => !mine.some((m) => (m.real_name ?? m.name).toLowerCase() === g.main.toLowerCase()))
      .map((g) => ({
        key: g.id,
        main: g.main,
        rest: g.rest,
        yours: false,
        pick: async () => {
          const place = g.prediction.toPlace();
          try {
            await place.fetchFields({ fields: ["displayName", "formattedAddress", "location"] });
          } catch {
            // (below: no location, so it can't be used)
          }
          const lat = place.location?.lat();
          const lng = place.location?.lng();
          if (lat === undefined || lng === undefined) return setProblem("Couldn't find where that is. Try another.");
          onPick({ kind: "real", googleId: g.id, name: place.displayName ?? g.main, address: place.formattedAddress ?? (g.rest || null), lat, lng, label: place.displayName ?? g.main, detail: place.formattedAddress ?? g.rest });
        },
      })),
  ];

  return (
    <div className={busy ? "pointer-events-none opacity-60" : ""}>
      <input
        type="search"
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(options.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            void options[active]?.pick();
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className={`${inputClassName} [&::-webkit-search-cancel-button]:hidden`}
        style={{ outline: "none" }}
      />
      {options.length > 0 && (
        <ul className="mt-1.5 max-h-56 overflow-auto rounded-[10px] border border-line bg-paper py-1">
          {options.map((o, i) => (
            <li key={o.key}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => void o.pick()}
                className={`flex w-full items-start gap-2.5 px-3 py-2 text-left text-sm ${i === active ? "bg-surface" : ""}`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`mt-0.5 shrink-0 ${o.yours ? "text-accent" : "text-muted"}`}>
                  <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" stroke="currentColor" strokeWidth="2" fill={o.yours ? "currentColor" : "none"} fillOpacity={o.yours ? 0.18 : 0} />
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
      {problem && <p className="mt-1.5 px-1 text-xs text-danger">{problem}</p>}
    </div>
  );
}
