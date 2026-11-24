"use client";

import Select from "./Select";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import Floating from "./Floating";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { deleteCategory, deleteJob, jobEntryCount, placeIdFor, saveCategory, saveJob, type JobPrefs } from "@/app/mbm/actions";
import PageMark from "./PageMark";
import { setPrivate } from "@/app/mbm/social/actions";
import Menu from "./IconMenu";
import { reveal } from "./reveal";
import PlaceSearch from "./PlaceSearch";
import { PALETTE } from "@/mbm/colors";
import { eventJobId, overlap } from "@/mbm/eventJob";

// Jobs and categories. Each job's settings are written as what will actually happen ("Work starts
// by itself when you arrive at Russell Labs…"), with an "In short" line that updates as you change
// them. A category (School) gives its jobs its color, and settings they follow unless changed.

export type Job = JobPrefs & { id: string; name: string; color: string; own_color?: string | null; category_id?: string | null; last_used_at?: string | null; private?: boolean; calendar_names?: string[]; calendar_ignore?: string[] };
// A name on your calendar (last 60 days and next 30): how many times.
export type CalEvent = { title: string; n: number };
export type Category = JobPrefs & { id: string; name: string; color: string; private?: boolean };
type Place = { id: string; name: string };
type Mode = "always" | "calendar" | "never";

const blank: JobPrefs = { stop_on_commute: null, places: null, start_mode: null, weekly_goal_min: null, hide_from_stats: null };
const RECENT = 5;
const STALE_DAYS = 50; // (not used in this long: listed apart, below)

export default function JobsView({ jobs, categories, places, needsSql = false, now = 0, events = [] }: { jobs: Job[]; categories: Category[]; places: Place[]; needsSql?: boolean; now?: number; events?: CalEvent[] }) {
  const [openJob, setOpenJob] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null); // (opened straight at "Delete?")
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  // Sort and filter, like Places. Untouched (most recent, all jobs), it's your 5 most recent.
  const [sort, setSort] = useState<"recent" | "az" | "za" | "oldest">("recent");
  const [show, setShow] = useState("all"); // all | cat:<id> | none | stale | auto
  const catOf = (j: Job) => categories.find((c) => c.id === j.category_id) ?? null;
  // What you open scrolls to the middle of the screen.
  useEffect(() => {
    if (openJob) reveal(`job-${openJob}`);
  }, [openJob]);
  useEffect(() => {
    if (openCat) reveal(`cat-${openCat}`);
    else if (adding) reveal("cat-new");
  }, [openCat, adding]);
  // Linked from an entry's box: /mbm/account/jobs#job-<id> opens that job.
  useEffect(() => {
    const m = window.location.hash.match(/^#job-(.+)$/);
    if (!m) return;
    const t = setTimeout(() => setOpenJob(m[1]), 0);
    return () => clearTimeout(t);
  }, []);

  const query = q.trim().toLowerCase();
  const stale = (j: Job) => !!now && (!j.last_used_at || +new Date(j.last_used_at) < now - STALE_DAYS * 864e5);
  const browsing = !query && sort === "recent" && show === "all"; // (the usual view)
  const kept = (j: Job) =>
    show === "all" ||
    (show === "none" && !j.category_id) ||
    (show === "stale" && stale(j)) ||
    (show === "auto" && ["always", "calendar"].includes((j.start_mode ?? catOf(j)?.start_mode) ?? "")) || // (its own setting, or its category's)
    show === `cat:${j.category_id}`;
  const usedAt = (j: Job) => (j.last_used_at ? +new Date(j.last_used_at) : 0);
  const byName = (a: Job, b: Job) => a.name.localeCompare(b.name);
  const sorted = (list: Job[]) =>
    [...list].sort((a, b) =>
      sort === "az" ? byName(a, b) : sort === "za" ? byName(b, a) : sort === "oldest" ? usedAt(a) - usedAt(b) || byName(a, b) : usedAt(b) - usedAt(a) || byName(a, b),
    );
  const matches = (j: Job) => !query || j.name.toLowerCase().includes(query) || !!catOf(j)?.name.toLowerCase().includes(query);
  const found = browsing ? jobs.filter((j) => !stale(j)).slice(0, RECENT) : sorted(jobs.filter((j) => matches(j) && kept(j)));
  const old = browsing ? jobs.filter(stale) : [];
  const showName = show === "none" ? "No category" : show === "stale" ? `Not used in ${STALE_DAYS}+ days` : show === "auto" ? "Start by themselves" : categories.find((c) => `cat:${c.id}` === show)?.name;
  // (The one you came here for stays in the list.)
  const opened = openJob && !found.some((j) => j.id === openJob) && !old.some((j) => j.id === openJob) ? jobs.find((j) => j.id === openJob) : undefined;
  const shown = opened ? [opened, ...found] : found;
  const list = (items: Job[], empty?: string) => (
    <ul className="mt-2 divide-y divide-line overflow-hidden rounded-card border border-line bg-paper">
      {items.map((j) => (
        <li key={j.id} id={`job-${j.id}`} className="group relative scroll-mt-24">
          <button
            type="button"
            disabled={needsSql}
            onClick={() => {
              setDeleting(null);
              setOpenJob(openJob === j.id ? null : j.id);
            }}
            aria-expanded={openJob === j.id}
            className="flex w-full items-center gap-3 rounded-[inherit] px-5 py-3.5 pr-24 text-left outline-none hover:bg-surface/60 focus-visible:bg-surface/60 disabled:cursor-default"
          >
            <span className="size-3.5 shrink-0 rounded-full" style={{ background: j.color }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate font-semibold">{j.name}</span>
            <span className="hidden max-w-[50%] truncate text-sm text-muted sm:block">{short(j, catOf(j), places)}</span>
            {catOf(j) && <span className="shrink-0 rounded-full bg-surface px-2.5 py-0.5 text-xs font-semibold">{catOf(j)!.name}</span>}
          </button>
          {/* Edit and delete, on the right when you point at it. */}
          {!needsSql && (
            <span className="absolute right-3 top-[1.6rem] flex -translate-y-1/2 gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <IconButton
                label={`Edit ${j.name}`}
                onClick={() => {
                  setDeleting(null);
                  setOpenJob(j.id);
                }}
              >
                <path d="M4 20h4L19 9l-4-4L4 16v4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </IconButton>
              <IconButton
                label={`Delete ${j.name}`}
                danger
                onClick={() => {
                  setDeleting(j.id);
                  setOpenJob(j.id);
                }}
              >
                <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </IconButton>
            </span>
          )}
          {openJob === j.id && <JobSettings key={`${j.id}-${deleting === j.id}`} job={j} jobs={jobs} categories={categories} places={places} events={events} startDeleting={deleting === j.id} onDone={() => setOpenJob(null)} />}
        </li>
      ))}
      {items.length === 0 && empty && <li className="px-5 py-4 text-sm text-muted">{empty}</li>}
    </ul>
  );

  return (
    <div className="relative isolate">
      <PageMark kind="jobs" />
      <p className="text-sm font-semibold text-muted">
        <Link href="/account" className="hover:text-ink">
          Your account
        </Link>
      </p>
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Jobs</h1>
      <p className="mt-2 max-w-2xl text-muted">Choose where each job happens, and whether it starts and stops by itself. Put jobs in a category to give them one color and the same settings.</p>
      {needsSql && (
        <p role="alert" className="mt-4 rounded-control bg-surface px-4 py-3 text-sm text-danger">
          Run 043_jobs_and_categories.sql, then 044_clearer_jobs.sql, in Supabase to use this page.
        </p>
      )}

      {/* Jobs: a search, with your 5 most recent before you type (or sort or filter them all). */}
      <section className="mt-8">
        <div className="relative">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.2" />
            <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQ("")}
            placeholder={`Search your ${jobs.length} jobs…`}
            aria-label="Search your jobs"
            className="w-full rounded-full border border-line bg-paper py-3 pl-11 pr-11 outline-none focus:border-ink [&::-webkit-search-cancel-button]:hidden"
          />
          {q && <ClearSearch onClear={() => setQ("")} />}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-muted">{browsing ? "Used most recently" : query ? `${found.length} found` : `${found.length} ${found.length === 1 ? "job" : "jobs"}`}</p>
          <div className="flex items-center gap-1.5">
            {show !== "all" && (
              <button
                type="button"
                onClick={() => setShow("all")}
                aria-label={`Stop showing only ${showName}`}
                className="flex items-center gap-1.5 rounded-full bg-ink py-1 pl-3 pr-2 text-sm font-semibold text-paper"
              >
                {showName}
                <span aria-hidden="true" className="text-paper/70">
                  ×
                </span>
              </button>
            )}
            <Menu
              label="Sort"
              icon={<path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
              value={sort}
              onPick={(v) => setSort(v as typeof sort)}
              options={[
                ["recent", "Used most recently"],
                ["oldest", "Used longest ago"],
                ["az", "A to Z"],
                ["za", "Z to A"],
              ]}
            />
            <Menu
              label="Filter"
              active={show !== "all"}
              icon={<path d="M4 5h16l-6 7.5V19l-4 1.5v-8L4 5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />}
              value={show}
              onPick={setShow}
              options={[
                ["all", "All jobs"],
                ...categories.map((c) => [`cat:${c.id}`, c.name] as const),
                ["none", "No category"],
                ["auto", "Start by themselves"],
                ["stale", `Not used in ${STALE_DAYS}+ days`],
              ]}
            />
          </div>
        </div>
        {list(shown, query ? `No job called “${q.trim()}”.` : browsing ? "No jobs yet. They appear here once you track something." : "No jobs here.")}
        {old.length > 0 && (
          <>
            <p className="mt-6 text-sm font-semibold text-muted">
              Not used in {STALE_DAYS}+ days · {old.length}
            </p>
            {list(old)}
          </>
        )}
      </section>

      {/* Categories */}
      <section className="mt-10">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">Categories</h2>
          {!adding && !needsSql && (
            <button type="button" onClick={() => setAdding(true)} className="rounded-control px-3 py-2 text-sm font-semibold ring-1 ring-line hover:bg-surface">
              New category
            </button>
          )}
        </div>
        <div className="mt-3 grid gap-3">
          {adding && <CategoryCard places={places} jobs={[]} open onToggle={() => setAdding(false)} onDone={() => setAdding(false)} />}
          {categories.map((c) => (
            <CategoryCard
              key={c.id}
              category={c}
              places={places}
              jobs={jobs.filter((j) => j.category_id === c.id)}
              open={openCat === c.id}
              onToggle={() => setOpenCat(openCat === c.id ? null : c.id)}
              onDone={() => setOpenCat(null)}
            />
          ))}
          {categories.length === 0 && !adding && <p className="text-sm text-muted">None yet. A category like School can hold CS577, CS577 DIS and ENTOM201.</p>}
        </div>
      </section>
    </div>
  );
}

// ---------- What the settings add up to, in plain words ----------

type Effective = { stop: boolean; places: string[]; mode: Mode; hidden: boolean; goal: number | null; per: "day" | "week"; eventEnd: boolean };
const effective = (p: JobPrefs, parent: JobPrefs | null): Effective => ({
  stop: p.stop_on_commute ?? parent?.stop_on_commute ?? true,
  places: p.places ?? parent?.places ?? [],
  mode: (p.start_mode ?? parent?.start_mode ?? "never") as Mode,
  hidden: p.hide_from_stats ?? parent?.hide_from_stats ?? false,
  goal: p.weekly_goal_min,
  per: p.goal_per ?? "week",
  eventEnd: p.stop_at_event_end ?? parent?.stop_at_event_end ?? false,
});
const list = (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`);
const hours = (min: number) => (min < 60 ? `${min}m` : min % 60 === 0 ? `${min / 60}h` : `${(min / 60).toFixed(1)}h`);

function sentences(name: string, e: Effective, places: Place[], groupOf = false): string[] {
  const it = groupOf ? "they" : name;
  const at = list(e.places.map((id) => places.find((p) => p.id === id)?.name ?? "a place"));
  const out: string[] = [];
  if (e.places.length) {
    if (e.mode === "always") out.push(`${groupOf ? "Each" : name} starts by itself when you arrive at ${at}.`);
    else if (e.mode === "calendar") out.push(`${groupOf ? "Each" : name} starts by itself when you arrive at ${at}, but only if it's on your calendar then.`);
    else out.push(`${groupOf ? "Each" : name} happens at ${at}. You start it yourself.`);
    out.push(
      e.stop
        ? `Going between ${e.places.length > 1 ? "these places" : "there and back"} keeps ${groupOf ? "it" : "it"} going (the trip shows under it). Arriving anywhere else stops it, from when you left.`
        : `It keeps going when you leave, until you stop it.`,
    );
  } else {
    out.push(
      e.stop
        ? `${groupOf ? "Each" : name} stops by itself when you leave the place where you started it.`
        : `${groupOf ? "Each" : name} keeps going when you leave, until you stop it.`,
    );
  }
  if (e.eventEnd) out.push(`${groupOf ? "Each" : "It"} stops when its calendar event ends.`);
  if (e.goal) out.push(`Goal: ${hours(e.goal)} a ${e.per}${groupOf ? ", all together" : ""}.`);
  if (e.hidden) out.push(`Left out of Stats (${it === name ? "it still shows" : "they still show"} on the Day bar).`);
  return out;
}

function short(j: Job, c: Category | null, places: Place[]) {
  const e = effective(j, c);
  const at = e.places.map((id) => places.find((p) => p.id === id)?.name ?? "a place").join(", ");
  const bits = [];
  if (at) bits.push(at);
  if (at && e.mode === "always") bits.push("starts itself");
  if (at && e.mode === "calendar") bits.push("starts if planned");
  if (e.eventEnd) bits.push("stops at event end");
  if (!e.stop) bits.push("doesn't stop when you leave");
  if (e.goal) bits.push(`${hours(e.goal)}/${e.per}`);
  if (e.hidden) bits.push("not in Stats");
  return bits.join(" · ");
}

// ---------- A job ----------

function JobSettings({
  job,
  jobs,
  categories,
  places,
  events,
  onDone,
  startDeleting = false,
}: {
  job: Job;
  jobs: Job[];
  categories: Category[];
  places: Place[];
  events: CalEvent[];
  onDone: () => void;
  startDeleting?: boolean;
}) {
  const router = useRouter();
  const [p, setP] = useState<JobPrefs & { category_id: string | null }>({
    stop_on_commute: job.stop_on_commute ?? null,
    places: job.places ?? null,
    start_mode: job.start_mode ?? null,
    weekly_goal_min: job.weekly_goal_min ?? null,
    goal_per: job.goal_per ?? "week",
    hide_from_stats: job.hide_from_stats ?? null,
    ...(job.stop_at_event_end !== undefined ? { stop_at_event_end: job.stop_at_event_end } : {}),
    category_id: job.category_id ?? null,
  });
  const [color, setColor] = useState(job.category_id ? (job.own_color ?? job.color) : job.color);
  const [name, setName] = useState(job.name);
  const [calNames, setCalNames] = useState<string[]>(job.calendar_names ?? []);
  const [calIgnore, setCalIgnore] = useState<string[]>(job.calendar_ignore ?? []);
  const draft = { ...job, name: name.trim() || job.name, calendar_names: calNames, calendar_ignore: calIgnore };
  const cat = categories.find((c) => c.id === p.category_id) ?? null;
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [deleting, setDeleting] = useState(startDeleting);
  const save = () =>
    start(async () => {
      const res = await saveJob(job.id, {
        ...p,
        ...(color !== (job.category_id ? (job.own_color ?? job.color) : job.color) ? { color } : {}),
        ...(name.trim() !== job.name ? { name } : {}),
        ...(calNames.join("\n") !== (job.calendar_names ?? []).join("\n") ? { calendar_names: calNames } : {}),
        ...(calIgnore.join("\n") !== (job.calendar_ignore ?? []).join("\n") ? { calendar_ignore: calIgnore } : {}),
      });
      if (!res.ok) return setMessage(res.message);
      router.refresh();
      onDone();
    });
  return (
    <div className="border-t border-line bg-surface/40 px-5 py-6 sm:px-6">
      <InShort lines={sentences(job.name, effective(p, cat), places)} />
      <Field title="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Name" className="w-full max-w-sm rounded-control border border-line bg-paper px-3 py-2.5 focus:border-ink" style={{ outline: "none" }} />
      </Field>
      <Field title="Category" help={cat ? `${job.name} is ${cat.name}'s color. Anything below left on “Same as ${cat.name}” follows ${cat.name}'s settings.` : "Put it in a category to give it the category's color and settings."}>
        <Select
          value={p.category_id ?? ""}
          onChange={(v) => setP({ ...p, category_id: v || null })}
          label="Category"
          className="w-full max-w-sm"
          options={[{ value: "", label: "No category" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
        />
      </Field>
      <Field title="Color">
        <JobColor color={color} onChange={setColor} category={cat} />
      </Field>
      <Prefs
        name={job.name}
        value={p}
        onChange={(v) => setP({ ...p, ...v })}
        parent={cat}
        places={places}
        calendar={
          <OnCalendar
            job={draft}
            jobs={jobs}
            events={events}
            names={calNames}
            onChange={(n) => {
              setCalNames(n);
              // (Synced back: no longer taken off.)
              setCalIgnore((x) => x.filter((i) => !n.some((m) => m.trim().toLowerCase() === i.trim().toLowerCase())));
            }}
            onIgnore={(t) => setCalIgnore((x) => [...x, t])}
          />
        }
        synced={calNames.length > 0 || events.some((e) => eventJobId(e.title, jobs.map((j) => (j.id === job.id ? draft : j))) === job.id)}
      />
      <PrivateSwitch kind="job" id={job.id} on={!!job.private} inherited={!!cat?.private} />
      {deleting ? (
        <DeleteJob job={job} jobs={jobs} onCancel={() => setDeleting(false)} onDone={onDone} />
      ) : (
        <Buttons pending={pending} onSave={save} onCancel={onDone} onDelete={() => setDeleting(true)} deleteLabel="Delete job" message={message} />
      )}
    </div>
  );
}

// Which calendar events are this job: ones that match it by name by themselves, and ones you sync
// (searched from your calendar's names, so you don't have to remember them exactly). They start
// it when it starts by itself, and suggest it.
function OnCalendar({ job, jobs, events, names, onChange, onIgnore }: { job: Job; jobs: Job[]; events: CalEvent[]; names: string[]; onChange: (n: string[]) => void; onIgnore: (title: string) => void }) {
  const all = jobs.map((j) => (j.id === job.id ? job : j));
  const lower = new Set(names.map((n) => n.trim().toLowerCase()));
  const auto = events.filter((e) => eventJobId(e.title, all) === job.id && !lower.has(e.title.trim().toLowerCase()));
  const others = events
    .filter((e) => eventJobId(e.title, all) !== job.id)
    .sort((a, b) => overlap(job.name, b.title) - overlap(job.name, a.title) || b.n - a.n);
  const owner = (title: string) => jobs.find((j) => j.id === eventJobId(title, jobs))?.name;
  return (
    <Field title="Sync calendar event" help="Syncs a calendar event to this job, used for starting jobs automatically.">
      <ListBox add={<AddEvent job={job.name} options={others} owner={owner} onAdd={(t) => onChange([...names, t])} empty={events.length === 0} />}>
        {names.map((n) => (
          <ListRow key={n} icon="calendar" name={n} onRemove={() => onChange(names.filter((x) => x !== n))} />
        ))}
        {auto.map((e) => (
          <ListRow key={e.title} icon="calendar" name={e.title} note="Same name" onRemove={() => onIgnore(e.title)} />
        ))}
      </ListBox>
    </Field>
  );
}

// A job's places or calendar events: one box, a row each, and adding at the bottom.
function ListBox({ children, add }: { children: ReactNode; add: ReactNode }) {
  return (
    <div className="max-w-md divide-y divide-line rounded-card border border-line bg-paper">
      {children}
      {add}
    </div>
  );
}

function ListRow({ icon, name, note, onRemove }: { icon: "place" | "calendar"; name: string; note?: string; onRemove?: () => void }) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5">
      <RowIcon icon={icon} />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {note && <span className="shrink-0 text-xs text-muted">{note}</span>}
      {onRemove && (
        <button type="button" onClick={onRemove} className="shrink-0 rounded-control px-2 py-1 text-xs font-semibold text-muted hover:bg-surface hover:text-danger">
          Remove
        </button>
      )}
    </div>
  );
}

function RowIcon({ icon }: { icon: "place" | "calendar" | "add" }) {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-control bg-surface text-muted" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {icon === "place" ? (
          <>
            <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
            <circle cx="12" cy="10" r="2.3" />
          </>
        ) : icon === "calendar" ? (
          <>
            <rect x="3.5" y="5" width="17" height="15" rx="3" />
            <path d="M3.5 10h17M8 3v4M16 3v4" />
          </>
        ) : (
          <path d="M12 6v12M6 12h12" />
        )}
      </svg>
    </span>
  );
}

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-b-card px-3.5 py-2.5 text-left text-sm font-semibold text-muted transition-colors first:rounded-t-card hover:bg-surface/60 hover:text-ink">
      <RowIcon icon="add" />
      {label}
    </button>
  );
}

// Search your calendar's names (or type one that isn't on it yet) to sync.
function AddEvent({ job, options, owner, onAdd, empty }: { job: string; options: CalEvent[]; owner: (t: string) => string | undefined; onAdd: (t: string) => void; empty: boolean }) {
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [lit, setLit] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  if (!open) return <AddRow label="Sync a calendar event" onClick={() => setOpen(true)} />;
  const t = q.trim().toLowerCase();
  const hits = (t ? options.filter((o) => o.title.toLowerCase().includes(t)) : options).slice(0, 40);
  const typed = q.trim() && !options.some((o) => o.title.toLowerCase() === t) ? [{ title: q.trim(), n: 0 }] : [];
  const rows = [...hits, ...typed];
  // (Already another job's: it moves here, once you say so.)
  const pick = async (title: string) => {
    const other = owner(title);
    if (other) {
      setOpen(false);
      setQ("");
      const yes = await confirm({ title: `Move “${title}” to ${job}?`, body: `It's synced to ${other} now. It'll start ${job} instead.`, confirmLabel: "Move it" });
      if (yes) onAdd(title);
      return;
    }
    onAdd(title);
    setOpen(false);
    setQ("");
  };
  const close = () => {
    setOpen(false);
    setQ("");
  };
  return (
    <div className="flex items-center gap-3 px-3.5 py-2">
      <RowIcon icon="calendar" />
      <input
        ref={field}
        autoFocus
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setLit(0);
        }}
        onBlur={(e) => !pop.current?.contains(e.relatedTarget as Node) && close()}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setLit((i) => Math.max(0, Math.min(rows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1))));
          }
          if (e.key === "Enter") {
            e.preventDefault();
            if (rows[lit]) pick(rows[lit].title);
          }
        }}
        placeholder={empty ? "Type the event's name" : "Search your calendar"}
        aria-label="Search your calendar"
        className="min-w-0 flex-1 bg-transparent py-1 text-sm"
        style={{ outline: "none" }}
      />
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={close} className="shrink-0 rounded-control px-2 py-1 text-xs font-semibold text-muted hover:bg-surface hover:text-ink">
        Cancel
      </button>
      {rows.length > 0 && (
        <Floating anchor={field} popRef={pop}>
          <ul role="listbox" aria-label="Calendar events" onMouseDown={(e) => e.preventDefault()} className="max-h-72 w-96 max-w-[90vw] overflow-y-auto rounded-card bg-paper p-1.5 shadow-xl shadow-ink/15 ring-1 ring-line">
            {rows.map((o, i) => {
              const synced = o.n ? owner(o.title) : undefined;
              return (
                <li
                  key={o.title + i}
                  role="option"
                  aria-selected={i === lit}
                  onMouseEnter={() => setLit(i)}
                  onClick={() => pick(o.title)}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-control px-3 py-2 text-sm ${i === lit ? "bg-surface" : ""}`}
                >
                  <span className="min-w-0 truncate">{o.n ? o.title : `Use “${o.title}”`}</span>
                  {(synced || !o.n) && <span className="shrink-0 text-xs text-muted">{synced ?? "not on your calendar yet"}</span>}
                </li>
              );
            })}
          </ul>
        </Floating>
      )}
    </div>
  );
}

function DeleteJob({ job, jobs, onCancel, onDone }: { job: Job; jobs: Job[]; onCancel: () => void; onDone: () => void }) {
  const router = useRouter();
  const [count, setCount] = useState<number | null>(null);
  const [what, setWhat] = useState<"move" | "delete">("move");
  const others = jobs.filter((j) => j.id !== job.id);
  const [to, setTo] = useState(others[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    let live = true;
    jobEntryCount(job.id).then((n) => live && setCount(n));
    return () => {
      live = false;
    };
  }, [job.id]);
  const go = () =>
    start(async () => {
      const res = await deleteJob(job.id, count && what === "move" ? to : null);
      if (!res.ok) return setMessage(res.message);
      router.refresh();
      onDone();
    });
  const n = count ?? 0;
  return (
    <div role="alertdialog" aria-label={`Delete ${job.name}`} className="mt-6 rounded-card border border-danger/30 bg-paper p-5">
      <p className="font-semibold">Delete {job.name}?</p>
      {count === null ? (
        <p className="mt-1 text-sm text-muted">Counting its entries…</p>
      ) : n === 0 ? (
        <p className="mt-1 text-sm text-muted">It has no entries, so nothing else changes.</p>
      ) : (
        <div className="mt-3 grid gap-2.5 text-sm">
          <p className="text-muted">
            It has {n} {n === 1 ? "entry" : "entries"}. What should happen to {n === 1 ? "it" : "them"}?
          </p>
          <label className="flex flex-wrap items-center gap-2.5">
            <input type="radio" checked={what === "move"} onChange={() => setWhat("move")} className="size-4 accent-[var(--accent)]" />
            Move {n === 1 ? "it" : "them"} to
            <Select value={to} onChange={setTo} disabled={what !== "move"} label="Move to" className="w-56" options={others.map((j) => ({ value: j.id, label: j.name }))} />
          </label>
          <label className="flex items-center gap-2.5">
            <input type="radio" checked={what === "delete"} onChange={() => setWhat("delete")} className="size-4 accent-[var(--accent)]" />
            Delete {n === 1 ? "it" : `all ${n}`} too (that time becomes untracked; can&apos;t be undone)
          </label>
        </div>
      )}
      <div className="mt-4 flex items-center gap-2">
        <button type="button" onClick={go} disabled={pending || count === null || (what === "move" && n > 0 && !to)} className="h-10 rounded-control bg-danger px-5 text-sm font-semibold text-paper disabled:opacity-60">
          {pending ? "Deleting…" : n > 0 && what === "move" ? `Move and delete ${job.name}` : `Delete ${job.name}`}
        </button>
        <button type="button" onClick={onCancel} className="h-10 rounded-control px-4 text-sm font-semibold text-muted hover:bg-surface">
          Keep it
        </button>
      </div>
      {message && <p className="mt-2 text-sm text-danger">{message}</p>}
    </div>
  );
}

// ---------- A category ----------

function CategoryCard({ category, jobs, places, open, onToggle, onDone }: { category?: Category; jobs: Job[]; places: Place[]; open: boolean; onToggle: () => void; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState(category?.color ?? PALETTE[3]);
  const [p, setP] = useState<JobPrefs>(
    category
      ? { stop_on_commute: category.stop_on_commute, places: category.places, start_mode: category.start_mode, weekly_goal_min: category.weekly_goal_min, goal_per: category.goal_per, hide_from_stats: category.hide_from_stats, ...(category.stop_at_event_end !== undefined ? { stop_at_event_end: category.stop_at_event_end } : {}) }
      : blank,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const res = await saveCategory({ id: category?.id, name, color, ...p });
      if (!res.ok) return setMessage(res.message);
      router.refresh();
      onDone();
    });
  const remove = () =>
    start(async () => {
      if (!category) return;
      const res = await deleteCategory(category.id);
      if (!res.ok) return setMessage(res.message);
      router.refresh();
      onDone();
    });
  const label = name.trim() || "This category";
  return (
    <div id={category ? `cat-${category.id}` : "cat-new"} className="scroll-mt-24 overflow-hidden rounded-card border border-line bg-paper">
      {category && (
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-surface/60">
          <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: category.color }} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg font-semibold">{category.name}</span>
            <span className="block truncate text-sm text-muted">{jobs.length ? jobs.map((j) => j.name).join(", ") : "No jobs in it yet. Pick it in a job's settings above."}</span>
          </span>
          {category.weekly_goal_min && <span className="shrink-0 text-sm text-muted">{hours(category.weekly_goal_min)}/{category.goal_per ?? "week"}</span>}
        </button>
      )}
      {open && (
        <div className={`${category ? "border-t border-line" : ""} bg-surface/40 px-5 py-6 sm:px-6`}>
          <InShort lines={[`Every job in ${label} is this color.`, ...sentences(label, effective(p, null), places, true)]} />
          <Field title="Name">
            <input autoFocus={!category} value={name} onChange={(e) => setName(e.target.value)} placeholder="School" className="w-full max-w-sm rounded-control border border-line bg-paper px-3 py-2.5" />
          </Field>
          <Field title="Color" help={`Every job in ${label} gets this color. A job taken out of it gets its own color back.`}>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={c}
                  onClick={() => setColor(c)}
                  className={`grid size-8 place-items-center rounded-full transition-transform hover:scale-110 ${color === c ? "ring-2 ring-ink ring-offset-2 ring-offset-paper" : ""}`}
                  style={{ background: c }}
                >
                  {color === c && <Tick />}
                </button>
              ))}
              <label
                className={`relative grid size-8 cursor-pointer place-items-center rounded-full ${PALETTE.includes(color) ? "ring-1 ring-line" : "ring-2 ring-ink ring-offset-2 ring-offset-paper"}`}
                title="Any color"
                style={PALETTE.includes(color) ? {} : { background: color }}
              >
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
                {PALETTE.includes(color) ? <span className="text-sm text-muted">+</span> : <Tick />}
              </label>
            </div>
          </Field>
          <p className="mt-6 text-sm text-muted">Settings for its jobs (a job can still choose differently):</p>
          <Prefs name={`${label}'s jobs`} value={p} onChange={(v) => setP({ ...p, ...v })} places={places} group />
          {category && <PrivateSwitch kind="category" id={category.id} on={!!category.private} />}
          <Buttons pending={pending} onSave={save} onCancel={onDone} onDelete={category ? remove : undefined} deleteLabel="Delete category (its jobs stay)" message={message} />
        </div>
      )}
    </div>
  );
}

// ---------- The settings ----------

// A job's (parent: its category, which unset settings follow) or a category's.
function Prefs({
  name,
  value,
  onChange: change,
  parent = null,
  places: known,
  group = false,
  calendar = null,
  synced = true,
}: {
  name: string;
  value: JobPrefs;
  onChange: (v: Partial<JobPrefs>) => void;
  parent?: Category | null;
  places: Place[];
  group?: boolean;
  calendar?: ReactNode; // (a job's synced calendar events, right under its places)
  synced?: boolean; // (any calendar events are this job: else "When the calendar event ends" is greyed out)
}) {
  // (A place found in the search that wasn't yours yet: shown by name until the page reloads.)
  const [added, setAdded] = useState<Place[]>([]);
  const places = [...known, ...added.filter((a) => !known.some((k) => k.id === a.id))];
  const onChange = (v: Partial<JobPrefs>, place?: Place) => {
    if (place) setAdded((a) => [...a, place]);
    change(v);
  };
  const e = effective(value, parent);
  const following = !group && value.places === null && !!parent?.places?.length;
  const myPlaces = value.places ?? (following ? parent!.places! : []);
  const at = list(e.places.map((id) => places.find((p) => p.id === id)?.name ?? "a place"));
  const it = group ? "it" : name;
  // "Same as School (…)" first, when there's a category.
  const same = (shown: string) => (parent ? [{ v: null, label: `Same as ${parent.name}`, note: shown }] : []);
  const parentMode = (parent?.start_mode ?? "never") as Mode;
  const modeWords: Record<Mode, string> = { always: "start by itself", calendar: "start only if it's on your calendar", never: "you start it yourself" };
  return (
    <>
      <Field title={group ? "Where do they happen?" : `Where does ${name} happen?`} help="Your named places (name a stop on the Day map to make one). Leave it empty if it can happen anywhere.">
        <ListBox
          add={following ? null : <AddPlace places={places.filter((p) => !myPlaces.includes(p.id))} onAdd={(id, place) => onChange({ places: [...myPlaces, id] }, place)} />}
        >
          {myPlaces.map((id) => (
            <ListRow
              key={id}
              icon="place"
              name={places.find((p) => p.id === id)?.name ?? "A place"}
              note={following ? `${parent!.name}'s` : undefined}
              onRemove={following ? undefined : () => onChange({ places: myPlaces.filter((x) => x !== id) })}
            />
          ))}
        </ListBox>
        {parent?.places?.length ? (
          <button type="button" onClick={() => onChange({ places: following ? [...parent.places!] : null })} className="mt-2 text-sm font-semibold text-muted underline underline-offset-2 hover:text-ink">
            {following ? "Use different places" : `Use ${parent.name}'s places instead`}
          </button>
        ) : null}
      </Field>
      {calendar}

      <Field title={e.places.length ? `When you arrive at ${at}` : "When you arrive"} help={e.places.length ? undefined : "Add a place above first: this is about arriving at one."}>
        <Choices
          disabled={!e.places.length}
          value={value.start_mode}
          onChange={(v) => onChange({ start_mode: v as Mode | null })}
          options={[
            ...same(modeWords[parentMode]),
            { v: "always", label: `Start ${it} automatically` },
            { v: "calendar", label: `Start ${it} only if it's on my calendar then` },
            { v: "never", label: "Don't start it. I'll start it myself" },
          ]}
        />
      </Field>

      {value.stop_at_event_end !== undefined && (
        <Field title="When the calendar event ends" help={synced ? undefined : "Sync a calendar event above first: this is about its end."}>
          <Choices
            disabled={!synced}
            value={value.stop_at_event_end === null ? null : value.stop_at_event_end ? "stop" : "keep"}
            onChange={(v) => onChange({ stop_at_event_end: v === null ? null : v === "stop" })}
            options={[
              ...same(parent?.stop_at_event_end ? "stops" : "keeps going"),
              { v: "stop", label: `Stop ${it} then` },
              { v: "keep", label: `Keep ${it} going` },
            ]}
          />
        </Field>
      )}

      <Field title="When you leave">
        <Choices
          value={value.stop_on_commute === null ? null : value.stop_on_commute ? "stop" : "keep"}
          onChange={(v) => onChange({ stop_on_commute: v === null ? null : v === "stop" })}
          options={[
            ...same(parent?.stop_on_commute === false ? "keeps going" : "stops"),
            e.places.length
              ? { v: "stop", label: `Stop ${it} when I get somewhere that isn't ${e.places.length > 1 ? "one of its places" : at}`, note: e.places.length > 1 ? `Trips between ${at} stay part of it, with the trip shown under it.` : "It stops from the moment you left." }
              : { v: "stop", label: `Stop ${it} when I leave the place where I started it` },
            { v: "keep", label: `Keep ${it} going until I stop it` },
          ]}
        />
      </Field>

      <Field title="Goal" help={`${group ? "For all its jobs together. " : ""}Shown on Stats: a daily goal on each day (and ×7 on the week), a weekly one on the week.`}>
        <Goal value={value.weekly_goal_min} per={value.goal_per ?? "week"} onChange={(min, per) => onChange({ weekly_goal_min: min, goal_per: per })} />
      </Field>

      <Field title="Stats">
        <Choices
          value={value.hide_from_stats === null ? null : value.hide_from_stats ? "hide" : "show"}
          onChange={(v) => onChange({ hide_from_stats: v === null ? null : v === "hide" })}
          options={[
            ...same(parent?.hide_from_stats ? "left out" : "counted"),
            { v: "show", label: `Count ${it} in Stats` },
            { v: "hide", label: `Leave ${it} out of Stats`, note: "It still shows on the Day bar." },
          ]}
        />
      </Field>
    </>
  );
}

// Private: others (followers, anyone you share with) see it as "Busy", in grey. Saved right away.
function PrivateSwitch({ kind, id, on, inherited = false }: { kind: "job" | "category"; id: string; on: boolean; inherited?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(on);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Field title="Private" help={inherited && !value ? "Its category is private, so it already shows as Busy." : undefined}>
      <label className="flex cursor-pointer items-start gap-3 rounded-control px-3 py-2.5 ring-1 ring-line hover:bg-paper/70">
        <input
          type="checkbox"
          checked={value}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.checked;
            setValue(next);
            start(async () => {
              const res = await setPrivate(kind, id, next);
              if (!res.ok) {
                setValue(!next);
                setMessage(res.message);
              } else {
                setMessage(null);
                router.refresh();
              }
            });
          }}
          className="mt-1 size-4 accent-[var(--accent)]"
        />
        <span>
          <span className="block font-semibold">{kind === "job" ? "Keep this job private" : "Keep these jobs private"}</span>
          <span className="block text-sm text-muted">Others see it as &ldquo;Busy&rdquo; on anything you share. You still see it as it is.</span>
        </span>
      </label>
      {message && <p className="mt-1.5 text-sm text-danger">{message}</p>}
    </Field>
  );
}

function Choices({ value, onChange, options, disabled = false }: { value: string | null; onChange: (v: string | null) => void; options: { v: string | null; label: string; note?: string }[]; disabled?: boolean }) {
  // Nothing chosen and no category: the first real option is the default.
  const chosen = options.some((o) => o.v === value) ? value : options.find((o) => o.v === null) ? null : defaultOf(options);
  return (
    <div role="radiogroup" className={`grid gap-1.5 ${disabled ? "pointer-events-none opacity-45" : ""}`}>
      {options.map((o) => {
        const on = chosen === o.v;
        return (
          <label key={String(o.v)} className={`flex cursor-pointer items-start gap-3 rounded-control px-3 py-2.5 ring-1 transition-colors ${on ? "bg-paper ring-ink/60" : "ring-line hover:bg-paper/70"}`}>
            <input type="radio" checked={on} onChange={() => onChange(o.v)} disabled={disabled} className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" />
            <span className="text-sm">
              <span className={on ? "font-semibold" : ""}>{o.label}</span>
              {o.note && <span className="mt-0.5 block text-xs text-muted">{o.v === null ? `Right now: ${o.note}` : o.note}</span>}
            </span>
          </label>
        );
      })}
    </div>
  );
}
// (Without a category, an unset setting shows its default: stop when you leave, don't start,
// count in Stats.)
function defaultOf(options: { v: string | null }[]) {
  const vs = options.map((o) => o.v);
  if (vs.includes("never")) return "never";
  if (vs.includes("stop")) return "stop";
  if (vs.includes("show")) return "show";
  return vs[0];
}

function InShort({ lines }: { lines: string[] }) {
  return (
    <div aria-live="polite" className="rounded-card bg-paper px-5 py-4 ring-1 ring-line">
      <p className="text-xs font-semibold text-muted">In short</p>
      <p className="mt-1 text-[15px] leading-relaxed">{lines.join(" ")}</p>
    </div>
  );
}

function Field({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <div className="mt-6">
      <p className="font-semibold">{title}</p>
      {help && <p className="mb-2 mt-0.5 text-sm text-muted">{help}</p>}
      <div className={help ? "" : "mt-2"}>{children}</div>
    </div>
  );
}

function Buttons({ pending, onSave, onCancel, onDelete, deleteLabel, message }: { pending: boolean; onSave: () => void; onCancel: () => void; onDelete?: () => void; deleteLabel: string; message: string | null }) {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-2">
      <button type="button" onClick={onSave} disabled={pending} className="h-11 rounded-control bg-accent px-6 font-semibold text-accent-ink disabled:opacity-60">
        {pending ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={onCancel} className="h-11 rounded-control px-4 text-sm font-semibold text-muted hover:bg-surface">
        Cancel
      </button>
      {onDelete && (
        <button type="button" onClick={onDelete} disabled={pending} className="ml-auto h-11 rounded-control px-4 text-sm font-semibold text-danger hover:bg-danger/10">
          {deleteLabel}
        </button>
      )}
      {message && (
        <p role="alert" className="w-full text-sm text-danger">
          {message}
        </p>
      )}
    </div>
  );
}

// Adding a place to a job: a search (your places, then actual places, which become yours).
function AddPlace({ places, onAdd }: { places: Place[]; onAdd: (id: string, place: Place) => void }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) return <AddRow label="Add a place" onClick={() => setOpen(true)} />;
  return (
    <div className="px-3.5 py-2.5">
      <div className="flex items-center gap-3">
        <RowIcon icon="place" />
        <div className="min-w-0 flex-1">
          <PlaceSearch
            places={places.map((p) => ({ ...p, lat: 0, lng: 0 }))}
            autoFocus
            busy={pending}
            placeholder="Search your places, or anywhere"
            onPick={(p) =>
              start(async () => {
                const res = await placeIdFor(p);
                if (!res.ok || !res.id) return setMessage(res.ok ? "Couldn't add that." : res.message);
                onAdd(res.id, { id: res.id, name: p.label });
                setOpen(false);
                setMessage(null);
              })
            }
          />
        </div>
        <button type="button" onClick={() => setOpen(false)} className="shrink-0 rounded-control px-2 py-1 text-xs font-semibold text-muted hover:bg-surface hover:text-ink">
          Cancel
        </button>
      </div>
      {message && <p className="mt-1 text-xs text-danger">{message}</p>}
    </div>
  );
}

// A goal: an amount (minutes or hours) a day or a week. Stored in minutes.
function Goal({ value, per, onChange }: { value: number | null; per: "day" | "week"; onChange: (min: number | null, per: "day" | "week") => void }) {
  const [unit, setUnit] = useState<"min" | "h">(value && value < 60 ? "min" : "h");
  const shown = value ? (unit === "h" ? Math.round((value / 60) * 100) / 100 : value) : "";
  const set = (n: string, u = unit, p = per) => onChange(n === "" ? null : Math.max(1, Math.min(p === "day" ? 1440 : 10080, Math.round(Number(n) * (u === "h" ? 60 : 1)))) || null, p);
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      <input type="number" min={0} step={unit === "h" ? 0.5 : 5} value={shown} onChange={(e) => set(e.target.value)} placeholder="None" aria-label="Goal amount" className="w-24 rounded-control border border-line bg-paper px-3 py-2.5" />
      <Select
        value={unit}
        label="Minutes or hours"
        className="w-32"
        onChange={(v) => {
          const u = v as "min" | "h";
          setUnit(u);
          if (shown !== "") set(String(shown), u);
        }}
        options={[
          { value: "min", label: "minutes" },
          { value: "h", label: "hours" },
        ]}
      />
      <Select
        value={per}
        label="Per day or week"
        className="w-32"
        onChange={(v) => onChange(value, v as "day" | "week")}
        options={[
          { value: "day", label: "a day" },
          { value: "week", label: "a week" },
        ]}
      />
    </span>
  );
}

// A job's own color (not while it's in a category: then it's the category's).
function JobColor({ color, onChange, category }: { color: string; onChange: (c: string) => void; category: Category | null }) {
  if (category)
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <span className="size-5 rounded-full" style={{ background: category.color }} aria-hidden="true" />
        {category.name}&apos;s color. Take it out of {category.name} to give it its own.
      </p>
    );
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={color === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className={`grid size-8 place-items-center rounded-full transition-transform hover:scale-110 ${color === c ? "ring-2 ring-ink ring-offset-2 ring-offset-paper" : ""}`}
          style={{ background: c }}
        >
          {color === c && <Tick />}
        </button>
      ))}
      <label
        className={`relative grid size-8 cursor-pointer place-items-center rounded-full ${PALETTE.includes(color) ? "ring-1 ring-line" : "ring-2 ring-ink ring-offset-2 ring-offset-paper"}`}
        title="Any color"
        style={PALETTE.includes(color) ? {} : { background: color }}
      >
        <input type="color" value={color} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
        {PALETTE.includes(color) ? <span className="text-sm text-muted">+</span> : <Tick />}
      </label>
      <span className="self-center text-sm text-muted">{PALETTE.includes(color) ? "" : "Your own color"}</span>
    </div>
  );
}

// (The chosen color: a tick on it.)
function Tick() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="pointer-events-none drop-shadow">
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconButton({ label, onClick, danger = false, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={`grid size-8 place-items-center rounded-full text-muted hover:bg-surface ${danger ? "hover:text-danger" : "hover:text-ink"}`}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

export function ClearSearch({ onClear }: { onClear: () => void }) {
  return (
    <button type="button" onClick={onClear} aria-label="Clear the search" className="absolute right-2.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    </button>
  );
}
