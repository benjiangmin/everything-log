"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { myPlaces, type EntryPlaceDraft, type PlaceLite } from "@/app/mbm/actions";
import PlaceSearch, { type Found } from "./PlaceSearch";

const PickOnMap = dynamic(() => import("./PlacePickerMap"), {
  ssr: false,
  loading: () => <div className="h-56 animate-pulse rounded-control bg-surface" />,
});

const chip = "rounded-full border px-3 py-1.5 text-sm transition-colors";

export type PlaceChoice = { place: EntryPlaceDraft; name: string } | null;

// Where a missed entry happened, before it's saved (an untracked stretch has no phone stops to go
// by): one of your places, anywhere in the search, or a new spot on the map. Saved with the entry.
export default function NewEntryPlace({ value, onChange }: { value: PlaceChoice; onChange: (v: PlaceChoice) => void }) {
  const [places, setPlaces] = useState<PlaceLite[] | null>(null);
  const [open, setOpen] = useState(false);
  const [mapping, setMapping] = useState(false);

  useEffect(() => {
    if (!open || places) return;
    let live = true;
    myPlaces().then((p) => live && setPlaces(p));
    return () => {
      live = false;
    };
  }, [open, places]);

  function set(v: PlaceChoice) {
    onChange(v);
    setOpen(false);
    setMapping(false);
  }

  const mine = (id: string) => {
    const p = places?.find((x) => x.id === id);
    if (p) set({ place: { kind: "mine", id }, name: p.name });
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setMapping(false);
        }}
        aria-expanded={open}
        title="Set where this happened"
        className="-mx-2 flex max-w-full items-center gap-2 rounded-control px-2 py-1.5 text-sm transition-colors hover:bg-surface"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-accent">
          <path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.4-6.5 11-6.5 11Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="12" cy="10" r="2.3" fill="currentColor" />
        </svg>
        <span className={`truncate ${value ? "font-semibold text-ink" : "text-muted"}`}>{value?.name ?? "Add a place"}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-3 rounded-control border border-line p-3">
          {places === null ? (
            <div className="h-11 animate-pulse rounded-control bg-surface" />
          ) : (
            <PlaceSearch
              places={places}
              onPick={(p: Found) => set({ place: p.kind === "mine" ? { kind: "mine", id: p.id } : p, name: p.label })}
              autoFocus
              placeholder="Search your places, or anywhere"
            />
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMapping((m) => !m)}
              aria-expanded={mapping}
              className={`${chip} border-dashed ${mapping ? "border-accent text-accent" : "border-muted/50 text-muted hover:border-muted hover:text-ink"}`}
            >
              {mapping ? "− New place" : "+ New place on the map"}
            </button>
            {value && (
              <button type="button" onClick={() => set(null)} className={`${chip} border-transparent text-muted hover:text-danger`}>
                Clear
              </button>
            )}
          </div>
          {mapping && places && (
            <PickOnMap
              center={null}
              places={places}
              onPickPlace={mine}
              onCreate={(name, lat, lng) => set({ place: { kind: "new", name, lat, lng }, name })}
              busy={false}
            />
          )}
        </div>
      )}
    </div>
  );
}
