"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { deleteCategory, saveCategory, saveJob, type JobPrefs } from "@/app/mbm/actions";
import { PALETTE } from "@/mbm/colors";

// Jobs and categories. A job's settings: what happens when you leave, its places, starting by
// itself there, a weekly goal, hiding it from Stats. A category (Schooling) gives its jobs its
// color, and its settings, which a job can set differently.

export type Job = JobPrefs & { id: string; name: string; color: string; own_color?: string | null; category_id?: string | null };
export type Category = JobPrefs & { id: string; name: string; color: string };
type Place = { id: string; name: string };

const blank: JobPrefs = { stop_on_commute: null, places: null, auto_start: null, weekly_goal_min: null, hide_from_stats: null };

export default function JobsView({ jobs, categories, places, needsSql = false }: { jobs: Job[]; categories: Category[]; places: Place[]; needsSql?: boolean }) {
  const [openJob, setOpenJob] = useState<string | null>(null);
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const catOf = (j: Job) => categories.find((c) => c.id === j.category_id) ?? null;
  // Linked from an entry's box: /mbm/account/jobs#job-<id> opens that job.
  useEffect(() => {
    const m = window.location.hash.match(/^#job-(.+)$/);
    if (!m) return;
    const t = setTimeout(() => {
      setOpenJob(m[1]);
      document.getElementById(`job-${m[1]}`)?.scrollIntoView({ block: "center" });
    }, 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div>
      <p className="text-sm font-semibold text-muted">
        <Link href="/mbm/account" className="hover:text-ink">
          Your account
        </Link>
      </p>
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Jobs</h1>
      <p className="mt-2 max-w-2xl text-muted">
        What each job does when you leave, where it happens, and goals. Put jobs in a category to give them one color and the same settings.
      </p>
      {needsSql && (
        <p role="alert" className="mt-4 rounded-control bg-surface px-4 py-3 text-sm text-danger">
          Run 043_jobs_and_categories.sql in Supabase to use this page.
        </p>
      )}

      {/* Categories */}
      <section className="mt-8">
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
          {categories.length === 0 && !adding && <p className="text-sm text-muted">None yet. A category like Schooling can hold CS577, CS577 DIS and ENTOM.</p>}
        </div>
      </section>

      {/* Jobs */}
      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold">Jobs</h2>
        <ul className="mt-3 divide-y divide-line rounded-card border border-line bg-paper">
          {jobs.map((j) => (
            <li key={j.id} id={`job-${j.id}`} className="scroll-mt-24">
              <button
                type="button"
                disabled={needsSql}
                onClick={() => setOpenJob(openJob === j.id ? null : j.id)}
                aria-expanded={openJob === j.id}
                className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-surface/60 disabled:cursor-default"
              >
                <span className="size-3.5 shrink-0 rounded-full" style={{ background: j.color }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-semibold">{j.name}</span>
                <span className="hidden truncate text-sm text-muted sm:block">{summary(j, catOf(j), places)}</span>
                {catOf(j) && <span className="shrink-0 rounded-full bg-surface px-2.5 py-0.5 text-xs font-semibold">{catOf(j)!.name}</span>}
              </button>
              {openJob === j.id && <JobSettings job={j} categories={categories} places={places} onDone={() => setOpenJob(null)} />}
            </li>
          ))}
          {jobs.length === 0 && <li className="px-5 py-4 text-sm text-muted">No jobs yet. They appear here once you track something.</li>}
        </ul>
      </section>
    </div>
  );
}

// One line about what's set, for the list.
function summary(j: JobPrefs, c: JobPrefs | null, places: Place[]) {
  const stop = j.stop_on_commute ?? c?.stop_on_commute ?? true;
  const ps = j.places ?? c?.places ?? [];
  const bits = [];
  if (!stop) bits.push("keeps going when you leave");
  else if (ps.length) bits.push(`at ${ps.map((id) => places.find((p) => p.id === id)?.name ?? "a place").join(", ")}`);
  if ((j.auto_start ?? c?.auto_start) && ps.length) bits.push("starts itself");
  if (j.weekly_goal_min) bits.push(`${hours(j.weekly_goal_min)}/week`);
  if (j.hide_from_stats ?? c?.hide_from_stats) bits.push("hidden from Stats");
  return bits.join(" · ");
}
const hours = (min: number) => (min % 60 === 0 ? `${min / 60}h` : `${(min / 60).toFixed(1)}h`);

function JobSettings({ job, categories, places, onDone }: { job: Job; categories: Category[]; places: Place[]; onDone: () => void }) {
  const router = useRouter();
  const [p, setP] = useState<JobPrefs & { category_id: string | null }>({
    stop_on_commute: job.stop_on_commute ?? null,
    places: job.places ?? null,
    auto_start: job.auto_start ?? null,
    weekly_goal_min: job.weekly_goal_min ?? null,
    hide_from_stats: job.hide_from_stats ?? null,
    category_id: job.category_id ?? null,
  });
  const cat = categories.find((c) => c.id === p.category_id) ?? null;
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const res = await saveJob(job.id, p);
      if (!res.ok) return setMessage(res.message);
      router.refresh();
      onDone();
    });
  return (
    <div className="border-t border-line bg-surface/40 px-5 py-5">
      <label className="grid max-w-sm gap-1.5 text-sm">
        <span className="font-semibold">Category</span>
        <select value={p.category_id ?? ""} onChange={(e) => setP({ ...p, category_id: e.target.value || null })} className="select-field w-full rounded-control border border-line bg-paper px-3 py-2.5">
          <option value="">None</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {cat && <span className="text-xs text-muted">Its color is {cat.name}&apos;s. Settings left on &ldquo;{cat.name}&rsquo;s&rdquo; follow the category.</span>}
      </label>
      <Prefs value={p} onChange={(v) => setP({ ...p, ...v })} parent={cat} places={places} />
      <Buttons pending={pending} onSave={save} onCancel={onDone} message={message} />
    </div>
  );
}

function CategoryCard({
  category,
  jobs,
  places,
  open,
  onToggle,
  onDone,
}: {
  category?: Category;
  jobs: Job[];
  places: Place[];
  open: boolean;
  onToggle: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState(category?.color ?? PALETTE[3]);
  const [p, setP] = useState<JobPrefs>(category ? { stop_on_commute: category.stop_on_commute, places: category.places, auto_start: category.auto_start, weekly_goal_min: category.weekly_goal_min, hide_from_stats: category.hide_from_stats } : blank);
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
  return (
    <div className="overflow-hidden rounded-card border border-line bg-paper">
      {category && (
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-surface/60">
          <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: category.color }} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg font-semibold">{category.name}</span>
            <span className="block truncate text-sm text-muted">{jobs.length ? jobs.map((j) => j.name).join(", ") : "No jobs in it yet: pick it in a job's settings below."}</span>
          </span>
          {category.weekly_goal_min && <span className="shrink-0 text-sm text-muted">{hours(category.weekly_goal_min)}/week</span>}
        </button>
      )}
      {open && (
        <div className={`${category ? "border-t border-line" : ""} bg-surface/40 px-5 py-5`}>
          <div className="flex flex-wrap items-end gap-4">
            <label className="grid flex-1 gap-1.5 text-sm">
              <span className="font-semibold">Name</span>
              <input autoFocus={!category} value={name} onChange={(e) => setName(e.target.value)} placeholder="Schooling" className="rounded-control border border-line bg-paper px-3 py-2.5" />
            </label>
          </div>
          <div className="mt-4">
            <p className="text-sm font-semibold">Color, for every job in it</p>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Color">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={c}
                  onClick={() => setColor(c)}
                  className={`size-8 rounded-full transition-transform hover:scale-110 ${color === c ? "ring-2 ring-ink ring-offset-2 ring-offset-paper" : ""}`}
                  style={{ background: c }}
                />
              ))}
              <label className="relative grid size-8 cursor-pointer place-items-center rounded-full ring-1 ring-line" title="Any color" style={PALETTE.includes(color) ? {} : { background: color }}>
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
                {PALETTE.includes(color) && <span className="text-sm text-muted">+</span>}
              </label>
            </div>
          </div>
          <Prefs value={p} onChange={(v) => setP({ ...p, ...v })} places={places} />
          <Buttons pending={pending} onSave={save} onCancel={onDone} onDelete={category ? remove : undefined} message={message} />
        </div>
      )}
    </div>
  );
}

// The settings, for a job (parent: its category, whose settings it follows unless set) or a
// category (no parent: unset means the default).
function Prefs({ value, onChange, parent, places }: { value: JobPrefs; onChange: (v: Partial<JobPrefs>) => void; parent?: Category | null; places: Place[] }) {
  const isJob = parent !== undefined;
  const followName = parent ? `${parent.name}'s` : "Default";
  const tri = (v: boolean | null, inherited: boolean, on: string, off: string) => (
    <>
      <option value="">{`${followName} (${inherited ? on : off})`}</option>
      <option value="on">{on}</option>
      <option value="off">{off}</option>
    </>
  );
  const pick = (s: string) => (s === "on" ? true : s === "off" ? false : null);
  const show = (v: boolean | null) => (v === true ? "on" : v === false ? "off" : "");
  const stopIn = parent?.stop_on_commute ?? true;
  const autoIn = parent?.auto_start ?? false;
  const hideIn = parent?.hide_from_stats ?? false;
  const following = isJob && value.places === null && !!parent?.places?.length;
  const myPlaces = value.places ?? (following ? parent!.places! : []);
  const sel = "select-field w-full rounded-control border border-line bg-paper px-3 py-2.5";
  return (
    <div className="mt-5 grid gap-5 sm:grid-cols-2">
      <label className="grid gap-1.5 text-sm">
        <span className="font-semibold">When you leave</span>
        <select value={show(value.stop_on_commute)} onChange={(e) => onChange({ stop_on_commute: pick(e.target.value) })} className={sel}>
          {tri(value.stop_on_commute, stopIn, "Stop it", "Keep it going")}
        </select>
        <span className="text-xs text-muted">With places below: it keeps going between them (the Commute goes under it), and stops when you get anywhere else.</span>
      </label>

      <div className="grid content-start gap-1.5 text-sm">
        <span className="font-semibold">Its places</span>
        {following && <span className="text-xs text-muted">{parent!.name}&apos;s places.</span>}
        <div className="flex flex-wrap gap-1.5">
          {myPlaces.map((id) => (
            <span key={id} className="flex items-center gap-1 rounded-full bg-paper py-1 pl-3 pr-1 ring-1 ring-line">
              {places.find((p) => p.id === id)?.name ?? "A place"}
              {!following && (
                <button type="button" aria-label="Remove" onClick={() => onChange({ places: myPlaces.filter((x) => x !== id) })} className="grid size-5 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink">
                  ×
                </button>
              )}
            </span>
          ))}
          {!following && (
            <select
              value=""
              onChange={(e) => e.target.value && onChange({ places: [...myPlaces, e.target.value] })}
              className="select-field rounded-full border border-dashed border-line bg-paper py-1 pl-3 text-sm text-muted"
              aria-label="Add a place"
            >
              <option value="">Add a place…</option>
              {places
                .filter((p) => !myPlaces.includes(p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          )}
        </div>
        {isJob && parent?.places?.length ? (
          <button type="button" onClick={() => onChange({ places: following ? [...parent.places!] : null })} className="w-max text-xs font-semibold text-muted underline underline-offset-2 hover:text-ink">
            {following ? "Use different places" : `Use ${parent.name}'s places`}
          </button>
        ) : null}
        {places.length === 0 && <span className="text-xs text-muted">Name a stop on the Day map to make it a place.</span>}
      </div>

      <label className="grid gap-1.5 text-sm">
        <span className="font-semibold">Arriving at its places</span>
        <select value={show(value.auto_start)} onChange={(e) => onChange({ auto_start: pick(e.target.value) })} className={sel}>
          {tri(value.auto_start, autoIn, "Start it", "Don't start it")}
        </select>
      </label>

      <label className="grid gap-1.5 text-sm">
        <span className="font-semibold">Weekly goal</span>
        <span className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            step={0.5}
            value={value.weekly_goal_min ? value.weekly_goal_min / 60 : ""}
            onChange={(e) => onChange({ weekly_goal_min: e.target.value ? Math.round(Number(e.target.value) * 60) || null : null })}
            placeholder="None"
            className="w-28 rounded-control border border-line bg-paper px-3 py-2.5"
          />
          <span className="text-muted">hours a week{isJob ? "" : ", all its jobs together"}</span>
        </span>
      </label>

      <label className="grid gap-1.5 text-sm">
        <span className="font-semibold">On Stats</span>
        <select value={show(value.hide_from_stats)} onChange={(e) => onChange({ hide_from_stats: pick(e.target.value) })} className={sel}>
          {tri(value.hide_from_stats, hideIn, "Hide it", "Show it")}
        </select>
      </label>
    </div>
  );
}

function Buttons({ pending, onSave, onCancel, onDelete, message }: { pending: boolean; onSave: () => void; onCancel: () => void; onDelete?: () => void; message: string | null }) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <button type="button" onClick={onSave} disabled={pending} className="h-11 rounded-control bg-accent px-6 font-semibold text-accent-ink disabled:opacity-60">
        {pending ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={onCancel} className="h-11 rounded-control px-4 text-sm font-semibold text-muted hover:bg-surface">
        Cancel
      </button>
      {onDelete && (
        <button type="button" onClick={onDelete} disabled={pending} className="ml-auto h-11 rounded-control px-4 text-sm font-semibold text-danger hover:bg-danger/10">
          Delete category
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
