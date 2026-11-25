"use client";

import { buildingAt } from "@/mbm/buildings";
import dynamic from "next/dynamic";
import Link from "next/link";
import { pickIsNear } from "@/mbm/nearcheck";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  deletePlace,
  editPlace,
  keepApart,
  mergePlaces,
  removeStop,
  setPlaceOutline,
  setStopPlace,
  type PlacePick,
} from "@/app/mbm/actions";
import PageMark from "./PageMark";
import Menu from "./IconMenu";
import { reveal } from "./reveal";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { clock, dayKeyOf, span } from "@/mbm/time";
import { ClearSearch } from "./JobsView";
import PlaceSearch, { type Found } from "./PlaceSearch";

// (The building map only loads when you open it.)
const BuildingPicker = dynamic(() => import("./BuildingPicker"), { ssr: false });

// Your places (your name for each, the actual place, how often you're there) and the stops you
// haven't named yet, in one spot: rename, link to the actual place, merge twins, delete.

export type PlaceRow = {
  id: string;
  name: string;
  own_name?: string | null;
  real_name?: string | null;
  real_address?: string | null;
  lat: number;
  lng: number;
  outline?: [number, number][] | null; // its building (032)
  outline_by_hand?: boolean; // (you picked it, 079)
  outline_checked?: boolean; // (false: its building needs looking up)
  count: number;
  last: string | null;
};
export type StopRow = {
  id: string;
  arrived_at: string;
  departed_at: string | null;
  lat: number;
  lng: number;
  auto_name: string | null;
};

export default function PlacesView({
  places,
  stops,
  tz,
  now,
  needsSql,
  keptApart = [],
  openId = null,
}: {
  openId?: string | null; // (opened to start with: from a stop's ⚙ on the Day map)
  places: PlaceRow[];
  stops: StopRow[];
  tz: string;
  now: number;
  needsSql: boolean;
  keptApart?: string[]; // look-alike groups you've said aren't the same
}) {
  const router = useRouter();
  const [closed, setClosed] = useState<{ places: boolean; stops: boolean }>({
    places: false,
    stops: false,
  });
  const [apart, setApart] = useState<string[]>(keptApart);
  const [, startApart] = useTransition();
  const [q, setQ] = useState("");
  // (?open=<place>, from a stop's ⚙ on the Day map: read here too, from the address itself.)
  const params = useSearchParams();
  const want = openId ?? params.get("open");
  const [open, setOpen] = useState<string | null>(want && places.some((p) => p.id === want) ? want : null);
  // Places whose building needs looking up (new, or its actual place moved): quietly, in the
  // background, then the list shows them.
  useEffect(() => {
    const todo = places.filter((p) => p.outline_checked === false && !p.outline_by_hand);
    if (!todo.length) return;
    let live = true;
    (async () => {
      let changed = false;
      for (const p of todo) {
        if (!live) return;
        const outline = await buildingAt(p.lat, p.lng, undefined, 45).catch(() => undefined);
        if (outline === undefined) continue; // (no answer: next time)
        const res = await setPlaceOutline(p.id, outline);
        changed ||= res.ok;
      }
      if (live && changed) router.refresh();
    })();
    return () => {
      live = false;
    };
    // (Once per visit to the page.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // What you open scrolls to the middle of the screen.
  useEffect(() => {
    if (open) reveal(`row-${open}`);
  }, [open]);
  // (Arriving with one open: once the page has settled, it's brought into view again.)
  useEffect(() => {
    if (!want) return;
    const t = setTimeout(() => reveal(`row-${want}`), 400);
    return () => clearTimeout(t);
  }, [want]);
  const [show, setShow] = useState<"all" | "unlinked" | "alike">("all");
  const query = q.trim().toLowerCase();
  const searched = query
    ? places.filter((p) =>
        [p.name, p.real_name, p.real_address].some((x) =>
          x?.toLowerCase().includes(query),
        ),
      )
    : places;
  const groupKey = (g: PlaceRow[]) =>
    g
      .map((p) => p.id)
      .sort()
      .join("+");
  const groups = lookAlike(searched).filter(
    (g) => !apart.includes(groupKey(g)),
  );
  const separate = (g: PlaceRow[]) => {
    const key = groupKey(g);
    setApart((a) => [...a, key]);
    startApart(async () => {
      const res = await keepApart(g.map((p) => p.id));
      if (!res.ok) setApart((a) => a.filter((k) => k !== key));
      else router.refresh();
    });
  };
  const [sort, setSort] = useState<Sort>("az");
  const shownPlaces = sortPlaces(
    show === "unlinked" ? searched.filter((p) => !p.real_name) : show === "alike" ? groups.flat() : searched,
    sort,
  );
  const shownStops = query
    ? stops.filter((s) => s.auto_name?.toLowerCase().includes(query))
    : stops;
  const day = (iso: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(new Date(iso));

  // One of your places in a list (click: change it).
  const placeRow = (p: PlaceRow) => (
    <>
      <button
        type="button"
        onClick={() => setOpen(open === p.id ? null : p.id)}
        aria-expanded={open === p.id}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-surface/60"
      >
        <Pin filled />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{p.name}</span>
          <span className="block truncate text-sm text-muted">
            {p.real_name && p.real_name !== p.name
              ? p.real_name
              : (p.real_address ?? "Not linked to an actual place")}
          </span>
        </span>
        <span className="shrink-0 text-right text-sm text-muted">
          {p.count
            ? `${p.count} visit${p.count === 1 ? "" : "s"}`
            : "No visits this year"}
          {p.last && <span className="block text-xs">last {day(p.last)}</span>}
        </span>
      </button>
      {open === p.id && !needsSql && (
        <EditPlace place={p} places={places} onDone={() => setOpen(null)} />
      )}
    </>
  );

  return (
    <div className="relative isolate">
      <PageMark kind="places" />
      <p className="text-sm font-semibold text-muted">
        <Link href="/account" className="hover:text-ink">
          Settings
        </Link>
      </p>
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        Places
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        Every place you&apos;ve named, and the stops you haven&apos;t yet. Give
        them your own names, link them to the actual place, or merge two that
        are the same.
      </p>
      {needsSql && (
        <p
          role="alert"
          className="mt-4 rounded-control bg-surface px-4 py-3 text-sm text-danger"
        >
          Run 047_real_places.sql, then 048_manage_places.sql, in Supabase to
          change places here.
        </p>
      )}

      <div className="relative mt-8">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
        >
          <circle
            cx="11"
            cy="11"
            r="7"
            stroke="currentColor"
            strokeWidth="2.2"
          />
          <path
            d="M20 20l-3.5-3.5"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${places.length} places and ${stops.length} unnamed stops…`}
          aria-label="Search places"
          className="w-full rounded-full border border-line bg-paper py-3 pl-11 pr-11 outline-none focus:border-ink [&::-webkit-search-cancel-button]:hidden"
        />
        {q && <ClearSearch onClear={() => setQ("")} />}
      </div>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Heading
            open={!closed.places}
            onToggle={() => setClosed((c) => ({ ...c, places: !c.places }))}
          >
            Your places{" "}
            <span className="text-base font-normal text-muted">
              {shownPlaces.length}
            </span>
          </Heading>
          <div className="flex items-center gap-1.5">
            {show !== "all" && (
              <button
                type="button"
                onClick={() => setShow("all")}
                aria-label={`Stop showing only ${show === "unlinked" ? "places not linked" : "look-alikes"}`}
                className="flex items-center gap-1.5 rounded-full bg-ink py-1 pl-3 pr-2 text-sm font-semibold text-paper"
              >
                {show === "unlinked" ? "Not linked" : "Look alike"}
                <span aria-hidden="true" className="text-paper/70">
                  ×
                </span>
              </button>
            )}
            <Menu
              label="Sort"
              icon={<path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
              value={sort}
              onPick={(v) => setSort(v as Sort)}
              options={[
                ["az", "A to Z"],
                ["za", "Z to A"],
                ["most", "Most visited"],
                ["least", "Least visited"],
                ["recent", "Visited most recently"],
              ]}
            />
            <Menu
              label="Filter"
              active={show !== "all"}
              icon={<path d="M4 5h16l-6 7.5V19l-4 1.5v-8L4 5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />}
              value={show}
              onPick={(v) => setShow(v as typeof show)}
              options={[
                ["all", "All places"],
                ["unlinked", "Not linked to an actual place"],
                ["alike", "Look alike"],
              ]}
            />
          </div>
        </div>
        {!closed.places && show === "alike" && (
          <p className="mt-2 text-sm text-muted">
            Places that might be the same one: open one and merge it into the
            other. Not the same? Point at the group and keep them apart.
          </p>
        )}
        {!closed.places && show === "alike" && groups.length > 0 && (
          <div className="mt-3 grid gap-3">
            {groups.map((g) => (
              <div key={groupKey(g)} className="group relative">
                <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-paper">
                  {g.map((p) => (
                    <li key={p.id} id={`row-${p.id}`}>{placeRow(p)}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => separate(g)}
                  className="absolute -top-3 right-4 rounded-full bg-paper px-3 py-1 text-xs font-semibold text-muted opacity-0 shadow ring-1 ring-line transition-opacity hover:text-ink focus:opacity-100 group-hover:opacity-100"
                >
                  Not the same: keep them apart
                </button>
              </div>
            ))}
          </div>
        )}
        {!closed.places && !(show === "alike" && groups.length > 0) && (
          <ul className="mt-3 divide-y divide-line rounded-card border border-line bg-paper">
            {shownPlaces.map((p) => (
              <li key={p.id} id={`row-${p.id}`}>{placeRow(p)}</li>
            ))}
            {shownPlaces.length === 0 && (
              <li className="px-5 py-4 text-sm text-muted">
                {show === "unlinked"
                  ? "Every place is linked to an actual place."
                  : show === "alike"
                    ? "No places look alike."
                    : query
                      ? "No places match."
                      : "None yet. Name a stop below, or on the Day map."}
              </li>
            )}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <Heading
          open={!closed.stops}
          onToggle={() => setClosed((c) => ({ ...c, stops: !c.stops }))}
        >
          Unnamed stops{" "}
          <span className="text-base font-normal text-muted">
            last 30 days · {shownStops.length}
          </span>
        </Heading>
        {!closed.stops && (
          <ul className="mt-3 divide-y divide-line rounded-card border border-line bg-paper">
            {shownStops.map((s) => {
              const end = s.departed_at ? +new Date(s.departed_at) : now;
              return (
                <li key={s.id} id={`row-${s.id}`}>
                  <button
                    type="button"
                    onClick={() => setOpen(open === s.id ? null : s.id)}
                    aria-expanded={open === s.id}
                    className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-surface/60"
                  >
                    <Pin />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {s.auto_name ?? "Unnamed stop"}
                      </span>
                      <span className="block truncate text-sm text-muted">
                        {s.auto_name
                          ? "Your phone's guess"
                          : `${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}`}
                      </span>
                    </span>
                    <span className="num shrink-0 text-right text-sm text-muted">
                      {day(s.arrived_at)}
                      <span className="block text-xs">
                        {clock(new Date(s.arrived_at), tz)}
                        {s.departed_at
                          ? ` – ${clock(new Date(s.departed_at), tz)}`
                          : " – now"}{" "}
                        · {span(end - +new Date(s.arrived_at))}
                      </span>
                    </span>
                  </button>
                  {open === s.id && !needsSql && (
                    <NameStopRow
                      stop={s}
                      places={places}
                      tz={tz}
                      onDone={() => setOpen(null)}
                    />
                  )}
                </li>
              );
            })}
            {shownStops.length === 0 && (
              <li className="px-5 py-4 text-sm text-muted">
                {query
                  ? "No stops match."
                  : "Every stop in the last 30 days has a name."}
              </li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
}

function EditPlace({
  place,
  places,
  onDone,
}: {
  place: PlaceRow;
  places: PlaceRow[];
  onDone: () => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const startOwn = place.own_name ?? "";
  const [own, setOwn] = useState(startOwn);
  const [real, setReal] = useState<Found | null>(null);
  const [searching, setSearching] = useState(!place.real_name);
  const [merging, setMerging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const linked = real
    ? { name: real.label, address: real.detail }
    : place.real_name
      ? { name: place.real_name, address: place.real_address ?? null }
      : null;
  const done = (res: { ok: boolean; message?: string }) => {
    if (!res.ok) return setMessage(res.message ?? "Couldn't save that.");
    router.refresh();
    onDone();
  };
  const save = () =>
    start(async () =>
      done(
        await editPlace(
          place.id,
          own.trim() !== startOwn.trim() ? own : null,
          real && real.kind === "real" ? real : null,
        ),
      ),
    );
  return (
    <div className="border-t border-line bg-surface/40 px-5 py-5 sm:px-6">
      <Labelled
        title="Your name for it"
        help={
          linked
            ? `Optional. Without one, it shows as “${linked.name}”.`
            : undefined
        }
      >
        <input
          value={own}
          onChange={(e) => setOwn(e.target.value)}
          maxLength={80}
          placeholder={linked?.name ?? "Home, Theory…"}
          className="w-full max-w-sm rounded-control border border-line bg-paper px-3 py-2.5"
        />
      </Labelled>
      <Labelled title="Actual place">
        {linked && !searching ? (
          <Linked
            name={linked.name}
            address={linked.address}
            onChange={() => setSearching(true)}
          />
        ) : (
          <PlaceSearch
            places={[]}
            near={{ lat: place.lat, lng: place.lng }}
            placeholder="Search for the actual place"
            onPick={(p) => (setReal(p), setSearching(false))}
          />
        )}
      </Labelled>
      {place.outline !== undefined && (
        <Labelled title="Building">
          <BuildingPicker place={place} outline={place.outline ?? null} />
        </Labelled>
      )}
      {merging && (
        <Labelled
          title={`Merge ${place.name} into…`}
          help={`Everything at ${place.name} (its stops, entries, jobs' places) moves to the one you pick, and ${place.name} goes.`}
        >
          <PlaceSearch
            mineOnly
            autoFocus
            places={places.filter((x) => x.id !== place.id)}
            placeholder="Which of your places?"
            busy={pending}
            onPick={async (p) => {
              if (p.kind !== "mine") return;
              const ok = await confirm({
                title: `Merge ${place.name} into ${p.label}?`,
                body: `${place.name} goes; everything there becomes ${p.label}.`,
                confirmLabel: "Merge",
              });
              if (ok)
                start(async () => done(await mergePlaces(place.id, p.id)));
            }}
          />
        </Labelled>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={
            pending ||
            (own.trim() === startOwn.trim() && !real) ||
            (!own.trim() && !linked)
          }
          className="h-11 rounded-control bg-accent px-6 font-semibold text-accent-ink disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="h-11 rounded-control px-4 text-sm font-semibold text-muted hover:bg-surface"
        >
          Cancel
        </button>
        <span className="ml-auto flex gap-1">
          <button
            type="button"
            onClick={() => setMerging((m) => !m)}
            className="h-11 rounded-control px-4 text-sm font-semibold text-ink hover:bg-surface"
          >
            {merging ? "Don't merge" : "Merge into another"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              const ok = await confirm({
                title: `Delete ${place.name}?`,
                body: `Its ${place.count || ""} stops become unnamed again. Your entries stay.`,
                confirmLabel: "Delete",
              });
              if (ok) start(async () => done(await deletePlace(place.id)));
            }}
            className="h-11 rounded-control px-4 text-sm font-semibold text-danger hover:bg-danger/10"
          >
            Delete
          </button>
        </span>
      </div>
      {message && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {message}
        </p>
      )}
    </div>
  );
}

function NameStopRow({
  stop,
  places,
  tz,
  onDone,
}: {
  stop: StopRow;
  places: PlaceRow[];
  tz: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [own, setOwn] = useState("");
  const [pick, setPick] = useState<Found | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const done = (res: { ok: boolean; message?: string }) => {
    if (!res.ok) return setMessage(res.message ?? "Couldn't save that.");
    router.refresh();
    onDone();
  };
  return (
    <div className="border-t border-line bg-surface/40 px-5 py-5 sm:px-6">
      <Labelled
        title="Where was it?"
        help="One of your places, or search for the actual place."
      >
        {pick ? (
          <Linked
            name={pick.label}
            address={pick.kind === "mine" ? "Your place" : pick.detail}
            onChange={() => setPick(null)}
          />
        ) : (
          <PlaceSearch
            places={places}
            initial={stop.auto_name ?? ""}
            near={{ lat: stop.lat, lng: stop.lng }}
            autoFocus
            placeholder="Search: Pres House, Target…"
            onPick={setPick}
          />
        )}
      </Labelled>
      <Labelled title="Your name for it" help="Optional.">
        <input
          value={own}
          onChange={(e) => setOwn(e.target.value)}
          maxLength={80}
          placeholder={pick?.label ?? "Home, Theory…"}
          className="w-full max-w-sm rounded-control border border-line bg-paper px-3 py-2.5"
        />
      </Labelled>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || (!pick && !own.trim())}
          onClick={() =>
            start(async () => {
              // (Only a place next to where the phone had you.)
              const far = await pickIsNear({ visitId: stop.id }, pick as PlacePick | null);
              done(far ? { ok: false, message: far } : await setStopPlace(stop.id, own.trim() ? own : null, pick as PlacePick | null));
            })
          }
          className="h-11 rounded-control bg-accent px-6 font-semibold text-accent-ink disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="h-11 rounded-control px-4 text-sm font-semibold text-muted hover:bg-surface"
        >
          Cancel
        </button>
        <span className="ml-auto flex gap-1">
          <Link
            href={`/day?day=${dayKeyOf(new Date(stop.arrived_at), tz)}`}
            className="grid h-11 place-items-center rounded-control px-4 text-sm font-semibold text-ink hover:bg-surface"
          >
            Open the day
          </Link>
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              const ok = await confirm({
                title: "Remove this stop?",
                body: "For a stop the phone made up. The trips on either side join up. Your entries stay.",
                confirmLabel: "Remove",
              });
              if (ok) start(async () => done(await removeStop(stop.id)));
            }}
            className="h-11 rounded-control px-4 text-sm font-semibold text-danger hover:bg-danger/10"
          >
            Remove stop
          </button>
        </span>
      </div>
      {message && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {message}
        </p>
      )}
    </div>
  );
}

function Linked({
  name,
  address,
  onChange,
}: {
  name: string;
  address: string | null;
  onChange: () => void;
}) {
  return (
    <div className="flex max-w-xl items-start gap-3 rounded-control bg-paper px-4 py-3 ring-1 ring-line">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{name}</span>
        {address && (
          <span className="block truncate text-sm text-muted">{address}</span>
        )}
      </span>
      <button
        type="button"
        onClick={onChange}
        className="shrink-0 text-sm font-semibold underline underline-offset-2"
      >
        Change
      </button>
    </div>
  );
}

function Labelled({
  title,
  help,
  children,
}: {
  title: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5 first:mt-0">
      <p className="font-semibold">{title}</p>
      {help && <p className="mt-0.5 text-sm text-muted">{help}</p>}
      <div className="mt-2 max-w-xl">{children}</div>
    </div>
  );
}

function Pin({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 ${filled ? "text-accent" : "text-muted"}`}
    >
      <path
        d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"
        stroke="currentColor"
        strokeWidth="2"
        fill="currentColor"
        fillOpacity={filled ? 0.2 : 0}
      />
      <circle cx="12" cy="9.5" r="2.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

// Places that might be the same one, in groups: the same name give or take punctuation and
// spaces ("Home", "Home!"), the same actual place, or within 60 m of each other.
function lookAlike(places: PlaceRow[]): PlaceRow[][] {
  const norm = (s: string | null | undefined) =>
    (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const metres = (a: PlaceRow, b: PlaceRow) =>
    Math.hypot(
      (a.lat - b.lat) * 111_000,
      (a.lng - b.lng) * 111_000 * Math.cos((a.lat * Math.PI) / 180),
    );
  const same = (a: PlaceRow, b: PlaceRow) =>
    (norm(a.name).length >= 2 && norm(a.name) === norm(b.name)) ||
    (!!a.real_name && norm(a.real_name) === norm(b.real_name)) ||
    metres(a, b) <= 60;
  const parent = places.map((_, i) => i);
  const root = (i: number): number =>
    parent[i] === i ? i : (parent[i] = root(parent[i]));
  for (let i = 0; i < places.length; i++)
    for (let j = i + 1; j < places.length; j++)
      if (same(places[i], places[j])) parent[root(i)] = root(j);
  const groups = new Map<number, PlaceRow[]>();
  places.forEach((p, i) =>
    groups.set(root(i), [...(groups.get(root(i)) ?? []), p]),
  );
  return [...groups.values()]
    .filter((g) => g.length > 1)
    .sort((a, b) => b.length - a.length);
}

// A section's heading: click to fold its list away (or open it again).
function Heading({
  open,
  onToggle,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex items-center gap-2 text-left font-display text-xl font-semibold"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className={`text-muted transition-transform ${open ? "rotate-90" : ""}`}
      >
        <path
          d="M9 5l7 7-7 7"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>{children}</span>
    </button>
  );
}

type Sort = "az" | "za" | "most" | "least" | "recent";
function sortPlaces(list: PlaceRow[], sort: Sort) {
  const name = (a: PlaceRow, b: PlaceRow) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  const out = [...list];
  if (sort === "az") out.sort(name);
  if (sort === "za") out.sort((a, b) => name(b, a));
  if (sort === "most") out.sort((a, b) => b.count - a.count || name(a, b));
  if (sort === "least") out.sort((a, b) => a.count - b.count || name(a, b));
  if (sort === "recent") out.sort((a, b) => (b.last ?? "").localeCompare(a.last ?? "") || name(a, b));
  return out;
}
