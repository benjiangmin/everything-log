"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  APIProvider,
  Map,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { around, buildingsNear, contains, type Outline } from "@/mbm/buildings";
import { buildingsNearPlace, setPlaceOutline } from "@/app/mbm/actions";
import { HtmlMarker, KEY, MAP_GROUND, stylesFor } from "./mapBits";

// A place's building, picked by hand: every building around it from OpenStreetMap, on a map;
// click the right one (or each piece of one, like Theory's wings) and save. If OpenStreetMap
// doesn't answer, it says what each server did. Or draw it: click its corners.
export default function BuildingPicker({
  place,
  outline,
  onSaved,
}: {
  place: { id: string; name: string; lat: number; lng: number };
  outline: Outline | null;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [shapes, setShapes] = useState<Outline[] | null>(null);
  const [log, setLog] = useState<string[] | null>(null);
  const [looking, setLooking] = useState(true);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [drawn, setDrawn] = useState<[number, number][] | null>(null); // (drawing it by hand: its corners so far)
  const [pending, start] = useTransition();

  // Look around it: your browser first, then the website's server.
  const look = async () => {
    setLooking(true);
    setLog(null);
    const notes: string[] = [];
    let found = await buildingsNear(place.lat, place.lng, 120, notes).catch(
      () => undefined,
    );
    if (found === undefined) {
      const res = await buildingsNearPlace(place.lat, place.lng).catch(() => ({
        shapes: null,
        log: ["The website couldn't ask either."],
      }));
      notes.push(...res.log.map((l) => `(website) ${l}`));
      found = res.shapes ?? undefined;
    }
    setShapes(found ?? null);
    setLog(found === undefined ? notes : null);
    // (The ones it's in now, picked to start with.)
    setPicked(
      new Set(
        (found ?? []).flatMap((s, i) =>
          outline &&
          outline.some(
            ([a, b]) =>
              contains(s, a, b) || s.some(([c, d]) => c === a && d === b),
          )
            ? [i]
            : [],
        ),
      ),
    );
    setLooking(false);
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- (looking it up when it opens)
    void look();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = (o: Outline | null) =>
    start(async () => {
      const res = await setPlaceOutline(place.id, o);
      if (!res.ok) return setMessage(res.message);
      router.refresh();
      onSaved();
    });

  if (!KEY)
    return (
      <p className="text-sm text-muted">
        The map needs NEXT_PUBLIC_GOOGLE_MAPS_KEY.
      </p>
    );
  const chosen = shapes
    ? [...picked].map((i) => shapes[i]).filter(Boolean)
    : [];
  return (
    <div>
      <div
        className="relative isolate h-72 overflow-hidden rounded-card ring-1 ring-line"
        style={{ background: MAP_GROUND.day }}
      >
        <APIProvider apiKey={KEY}>
          <Map
            styles={stylesFor(18)}
            backgroundColor={MAP_GROUND.day}
            defaultCenter={{ lat: place.lat, lng: place.lng }}
            defaultZoom={18}
            gestureHandling="cooperative"
            disableDefaultUI
            clickableIcons={false}
            draggableCursor={drawn ? "crosshair" : undefined}
            onClick={(e) => {
              const at = e.detail.latLng;
              if (drawn && at) setDrawn([...drawn, [at.lat, at.lng]]);
            }}
          >
            {drawn ? (
              <>
                {drawn.length >= 3 && (
                  <Shape outline={[...drawn, drawn[0]]} on />
                )}
                {drawn.map(([la, lo], i) => (
                  <HtmlMarker
                    key={i}
                    position={{ lat: la, lng: lo }}
                    zIndex={6}
                    passive
                  >
                    <span className="block size-2.5 translate-y-1/2 rounded-full border-2 border-paper bg-accent" />
                  </HtmlMarker>
                ))}
              </>
            ) : (
              !shapes && outline && <Shape outline={outline} on />
            )}
            {!drawn &&
              shapes?.map((s, i) => (
                <Shape
                  key={i}
                  outline={s}
                  on={picked.has(i)}
                  onClick={() =>
                    setPicked((p) => {
                      const n = new Set(p);
                      if (n.has(i)) n.delete(i);
                      else n.add(i);
                      return n;
                    })
                  }
                />
              ))}
            <HtmlMarker
              position={{ lat: place.lat, lng: place.lng }}
              zIndex={5}
              passive
            >
              <span className="block size-3.5 translate-y-1/2 rounded-full border-2 border-paper bg-ink shadow" />
            </HtmlMarker>
          </Map>
        </APIProvider>
        {looking && !drawn && (
          <p className="absolute inset-x-0 top-3 mx-auto w-max rounded-full bg-paper/95 px-3 py-1.5 text-xs font-semibold text-muted shadow">
            Finding buildings around it…
          </p>
        )}
      </div>
      {drawn ? (
        <p className="mt-2 text-sm text-muted">
          {drawn.length < 3
            ? `Click its corners, in order around it (${drawn.length} so far).`
            : `${drawn.length} corners. Keep clicking, or save it.`}
        </p>
      ) : log ? (
        <div className="mt-2 rounded-control bg-surface px-3 py-2 text-sm">
          <p className="font-semibold">OpenStreetMap didn&apos;t answer.</p>
          <ul className="mt-1 text-xs text-muted">
            {log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      ) : (
        !looking && (
          <p className="mt-2 text-sm text-muted">
            {shapes?.length
              ? "Click its building. Is it in pieces (like wings)? Click each one."
              : "No buildings found around it."}
          </p>
        )
      )}
      {drawn ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending || drawn.length < 3}
            onClick={() => save([...drawn, drawn[0]])}
            className="h-10 rounded-control bg-accent px-5 text-sm font-semibold text-accent-ink disabled:opacity-40"
          >
            {pending ? "Saving…" : "Save this building"}
          </button>
          <button
            type="button"
            disabled={!drawn.length}
            onClick={() => setDrawn(drawn.slice(0, -1))}
            className="h-10 rounded-control px-4 text-sm font-semibold text-ink hover:bg-surface disabled:opacity-40"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => setDrawn(null)}
            className="h-10 rounded-control px-4 text-sm font-semibold text-muted hover:bg-surface hover:text-ink"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending || chosen.length === 0}
            onClick={() => save(around(chosen))}
            className="h-10 rounded-control bg-accent px-5 text-sm font-semibold text-accent-ink disabled:opacity-40"
          >
            {pending
              ? "Saving…"
              : chosen.length > 1
                ? `Use these ${chosen.length} as one building`
                : "Use this building"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => save(null)}
            className="h-10 rounded-control px-4 text-sm font-semibold text-muted hover:bg-surface hover:text-ink"
          >
            Not in a building
          </button>
          {(log || !shapes) && !looking && (
            <button
              type="button"
              onClick={() => void look()}
              className="h-10 rounded-control px-4 text-sm font-semibold text-ink hover:bg-surface"
            >
              Try again
            </button>
          )}
          <button
            type="button"
            onClick={() => setDrawn([])}
            className="h-10 rounded-control px-4 text-sm font-semibold text-ink hover:bg-surface"
          >
            Draw it yourself
          </button>
        </div>
      )}
      {message && <p className="mt-2 text-sm text-danger">{message}</p>}
    </div>
  );
}

function Shape({
  outline,
  on,
  onClick,
}: {
  outline: Outline;
  on: boolean;
  onClick?: () => void;
}) {
  const map = useMap();
  const maps = useMapsLibrary("maps");
  useEffect(() => {
    if (!map || !maps) return;
    const shape = new maps.Polygon({
      map,
      paths: outline.map(([lat, lng]) => ({ lat, lng })),
      strokeColor: on ? "#3e281b" : "#86705f",
      strokeOpacity: on ? 0.9 : 0.5,
      strokeWeight: on ? 2.5 : 1.5,
      fillColor: on ? "#d4a373" : "#86705f",
      fillOpacity: on ? 0.5 : 0.08,
      clickable: !!onClick,
      zIndex: on ? 2 : 1,
    });
    const l = onClick ? shape.addListener("click", onClick) : null;
    return () => {
      l?.remove();
      shape.setMap(null);
    };
  }, [map, maps, outline, on, onClick]);
  return null;
}
