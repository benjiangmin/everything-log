"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useTransition } from "react";
import { entryPlaceInfo, newPlaceForEntry, setEntryPlace, type EntryPlaceInfo, type PlaceLite } from "@/app/mbm/actions";
import { metres } from "@/mbm/trips";

const PickOnMap = dynamic(() => import("./PlacePickerMap"), {
  ssr: false,
  loading: () => <div className="h-56 animate-pulse rounded-control bg-surface" />,
});

const chip = "rounded-full border px-3 py-1.5 text-sm transition-colors";

// Where an entry happened: what the phone thought, and a way to set it (one of your places, or a
// new spot on the map). Setting it fixes the phone's stops for that time, and teaches the app
// where you usually do this.
export default function EntryPlace({ blockId }: { blockId: string }) {
  const [info, setInfo] = useState<EntryPlaceInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [mapping, setMapping] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, run] = useTransition();

  useEffect(() => {
    let live = true;
    entryPlaceInfo(blockId).then((i) => live && setInfo(i));
    return () => {
      live = false;
    };
  }, [blockId]);

  // Saved: read it again (the page behind updates by itself) and fold the choices away.
  async function saved() {
    setInfo(await entryPlaceInfo(blockId));
    setOpen(false);
    setMapping(false);
  }

  if (!info) return <div className="h-12 animate-pulse rounded-control bg-surface" />;
  if (!info.ready) return <p className="text-xs text-muted">Run supabase/minute-by-minute/009_entry_places.sql to set where entries happened.</p>;

  function choose(placeId: string | null) {
    setMessage(null);
    run(async () => {
      const res = await setEntryPlace(blockId, placeId);
      if (res.ok) await saved();
      else setMessage(res.message);
    });
  }

  function create(name: string, lat: number, lng: number) {
    setMessage(null);
    run(async () => {
      const res = await newPlaceForEntry(blockId, name, lat, lng);
      if (res.ok) await saved();
      else setMessage(res.message);
    });
  }

  // Your places, the usual one first, then closest to where the phone had you.
  const near = info.phone;
  const sorted = [...info.places].sort((a, b) => (near ? metres(a, near) - metres(b, near) : a.name.localeCompare(b.name)));
  const list: PlaceLite[] = info.usual ? [info.usual, ...sorted.filter((p) => p.id !== info.usual!.id)] : sorted;

  return (
    <div className={`rounded-control border border-line px-3 py-2.5 ${pending ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-sm">
          <span className="text-muted">Where </span>
          {info.current ? (
            <span className="font-semibold text-ink">{info.current.name}</span>
          ) : near?.name ? (
            <>
              <span className="font-semibold text-ink">{near.name}</span>
              <span className="text-muted"> · from your phone</span>
            </>
          ) : (
            <span className="text-muted">not known</span>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setOpen((o) => !o);
            setMapping(false);
          }}
          aria-expanded={open}
          className="shrink-0 rounded-control px-2.5 py-1 text-sm font-semibold text-accent hover:bg-surface"
        >
          {open ? "Done" : info.current ? "Change" : "Set place"}
        </button>
      </div>

      {open && (
        <div className="mt-3 flex flex-col gap-3">
          {list.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {list.map((p) => {
                const on = info.current?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={pending}
                    onClick={() => choose(p.id)}
                    aria-pressed={on}
                    className={`${chip} ${on ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface text-ink hover:border-ink/40"}`}
                  >
                    {p.name}
                    {info.usual?.id === p.id && !on && <span className="ml-1 text-xs text-muted">usual</span>}
                  </button>
                );
              })}
            </div>
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
            {info.current && (
              <button type="button" disabled={pending} onClick={() => choose(null)} className={`${chip} border-transparent text-muted hover:text-danger`}>
                Clear
              </button>
            )}
          </div>
          {mapping && <PickOnMap center={info.current ?? near ?? null} places={info.places} onPickPlace={choose} onCreate={create} busy={pending} />}
        </div>
      )}
      {message && <p className="mt-2 text-xs text-danger">{message}</p>}
    </div>
  );
}
