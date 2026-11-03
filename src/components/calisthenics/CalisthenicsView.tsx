"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import {
  addBlock,
  addExercise,
  deleteBlock,
  deletePlan,
  deleteExercise,
  moveBlock,
  moveExercise,
  newPlan,
  renamePlan,
  updateBlock,
  updateExercise,
} from "@/app/calisthenics/actions";
import type { Block, Day, Exercise, Plan, PlanSummary } from "@/lib/calisthenics";
import StickyTop from "@/components/ui/StickyTop";
import { useConfirm } from "@/components/ui/ConfirmDialog";

const WEEK: { day: Exclude<Day, "daily">; short: string; long: string }[] = [
  { day: "mon", short: "Mon", long: "Monday" },
  { day: "tue", short: "Tue", long: "Tuesday" },
  { day: "wed", short: "Wed", long: "Wednesday" },
  { day: "thu", short: "Thu", long: "Thursday" },
  { day: "fri", short: "Fri", long: "Friday" },
  { day: "sat", short: "Sat", long: "Saturday" },
  { day: "sun", short: "Sun", long: "Sunday" },
];

const field =
  "min-w-0 rounded-control border border-line bg-paper px-2.5 py-1.5 text-ink placeholder:text-muted/60 focus:border-ink";

// Saves a change to the server; any problem shows at the top of the box.
type Run = (job: () => Promise<{ ok: boolean; message?: string }>) => void;

export default function CalisthenicsView({
  plan,
  plans,
  today,
}: {
  plan: Plan | null;
  plans: PlanSummary[];
  today: Exclude<Day, "daily">;
}) {
  const [day, setDay] = useState(today);
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState(false); // the "new plan: copy or blank?" box
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run: Run = (job) =>
    start(async () => {
      const res = await job();
      setError(res.ok ? null : (res.message ?? "Something went wrong."));
    });

  const daily = plan?.blocks.filter((b) => b.day === "daily") ?? [];
  const onDay = plan?.blocks.filter((b) => b.day === day) ?? [];
  const canEdit = Boolean(plan?.current) && editing;
  const label = WEEK.find((w) => w.day === day)!.long;

  return (
    <>
      <StickyTop className="sticky top-0 z-30 -mx-4 -mt-3 shrink-0 bg-paper px-4 pb-2 pt-3">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-accent px-5 py-3.5 text-accent-ink shadow-lg shadow-ink/15">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Calisthenics</h1>
          <div className="flex items-center gap-2">
            {plan && <PlanPicker plan={plan} plans={plans} onNew={() => setAsking(true)} run={run} />}
            {plan?.current && (
              <button
                type="button"
                onClick={() => setEditing((e) => !e)}
                className={`rounded-control border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  editing ? "border-accent-ink bg-accent-ink text-accent" : "border-accent-ink/25 hover:bg-accent-ink/10"
                }`}
              >
                {editing ? "Done" : "Edit"}
              </button>
            )}
          </div>
        </header>

        {/* Day tabs. Today has a dot. */}
        {plan && (
          <nav aria-label="Days" className="mt-2 grid grid-cols-7 gap-1 rounded-control bg-surface p-1">
            {WEEK.map((w) => (
              <button
                key={w.day}
                type="button"
                onClick={() => setDay(w.day)}
                aria-current={w.day === day ? "true" : undefined}
                className={`relative rounded-[9px] py-2 text-sm font-semibold transition-colors ${
                  w.day === day ? "bg-accent text-accent-ink" : "text-muted hover:bg-paper hover:text-ink"
                }`}
              >
                {w.short}
                {w.day === today && (
                  <span
                    aria-label="Today"
                    className={`absolute left-1/2 top-1 size-1 -translate-x-1/2 rounded-full ${w.day === day ? "bg-accent-ink" : "bg-accent"}`}
                  />
                )}
              </button>
            ))}
          </nav>
        )}
      </StickyTop>

      {!plan ? (
        <div className="mt-6 rounded-card border border-dashed border-line px-6 py-10 text-center">
          <p className="text-muted">No plan yet.</p>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => newPlan("blank"))}
            className="mt-4 rounded-control bg-accent px-5 py-2.5 font-semibold text-accent-ink hover:opacity-90"
          >
            Start Plan #1
          </button>
        </div>
      ) : (
        <div className="mt-4 flex flex-1 flex-col">
        {/* The box's top edge: sticks just under the bar while you scroll, so the box always has a
            top. The square paper backing hides what scrolls past its rounded corners.
            data-stick-under: the bar's own fade hides while this is stuck under it. */}
        <div data-stick-under className="sticky z-20 bg-paper" style={{ top: "var(--sticky-top, 0px)" }}>
          <div className="h-4 rounded-t-card border-x-[1.5px] border-t-[1.5px] border-ink" />
        </div>
        <section
          aria-label={`${label} workout`}
          className={`relative isolate flex-1 rounded-b-card border-x-[1.5px] border-b-[1.5px] border-ink px-3 pb-5 transition-opacity sm:px-5 ${
            pending ? "opacity-80" : ""
          }`}
        >
          {!plan.current && (
            <p className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface px-4 py-2.5 text-sm text-muted">
              <span>
                You&apos;re looking at an old plan. It&apos;s kept as it was.
              </span>
              <Link href="/calisthenics" className="font-semibold text-ink underline-offset-4 hover:underline">
                Back to the current plan →
              </Link>
            </p>
          )}
          {error && <p className="mb-3 rounded-control bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>}
          {canEdit && <PlanName plan={plan} run={run} />}

          <Section title="Every day" blocks={daily} day="daily" editing={canEdit} quick={plan.current} run={run} empty="Nothing every day." foldable />
          <Section title={label} blocks={onDay} day={day} editing={canEdit} quick={plan.current} run={run} empty="Rest day." today={day === today} />
        </section>
        </div>
      )}

      {asking && plan && (
        <NewPlanDialog
          current={plans[0]}
          onClose={() => setAsking(false)}
          run={run}
        />
      )}
    </>
  );
}

// ---------- Plan picker (Plan #2 ▾ → every plan, + New plan) ----------

function PlanPicker({ plan, plans, onNew, run }: { plan: Plan; plans: PlanSummary[]; onNew: () => void; run: Run }) {
  const [open, setOpen] = useState(false);
  const confirm = useConfirm();
  const router = useRouter();

  // Delete the plan you're looking at. Deleting the current one makes the one before it current.
  async function remove() {
    setOpen(false);
    const older = plans.find((p) => p.number < plan.number);
    const ok = await confirm({
      title: `Delete Plan #${plan.number}?`,
      body:
        `Every block and exercise in it goes too, for good.` +
        (plan.current && older ? ` Plan #${older.number} becomes your current plan again.` : ""),
      confirmLabel: "Delete",
    });
    if (!ok) return;
    run(async () => {
      const res = await deletePlan(plan.id);
      if (res.ok) router.push("/calisthenics");
      return res;
    });
  }
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-control border border-accent-ink/25 px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-accent-ink/10"
      >
        Plan #{plan.number}
        {plan.name && <span className="ml-1 max-w-32 truncate font-normal opacity-70">{plan.name}</span>}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="panel-pop absolute right-0 top-full z-40 mt-2 w-64 rounded-card border border-line bg-paper p-2 text-ink shadow-xl shadow-ink/15">
          <ul>
            {plans.map((p, i) => (
              <li key={p.id}>
                <Link
                  href={i === 0 ? "/calisthenics" : `/calisthenics?plan=${p.number}`}
                  onClick={() => setOpen(false)}
                  className={`flex items-baseline justify-between gap-2 rounded-control px-3 py-2 text-sm transition-colors hover:bg-surface ${
                    p.id === plan.id ? "bg-surface font-semibold" : ""
                  }`}
                >
                  <span className="min-w-0 truncate">
                    Plan #{p.number}
                    {p.name && <span className="ml-1.5 font-normal text-muted">{p.name}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {i === 0 ? "current" : new Date(p.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onNew();
            }}
            className="mt-1 w-full rounded-control border border-dashed border-line px-3 py-2 text-left text-sm text-muted transition-colors hover:border-ink hover:text-ink"
          >
            + New plan
          </button>
          <button
            type="button"
            onClick={remove}
            className="mt-1 w-full rounded-control px-3 py-2 text-left text-sm text-muted transition-colors hover:bg-danger/10 hover:text-danger"
          >
            Delete Plan #{plan.number}
          </button>
        </div>
      )}
    </div>
  );
}

function NewPlanDialog({ current, onClose, run }: { current: PlanSummary; onClose: () => void; run: Run }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const make = (mode: "copy" | "blank") =>
    start(async () => {
      const res = await newPlan(mode);
      if (!res.ok) return run(async () => res);
      onClose();
      router.push("/calisthenics");
    });

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <button type="button" aria-label="Cancel" onClick={onClose} className="absolute inset-0 bg-ink/30" />
      <div className="panel-pop relative w-full max-w-sm rounded-card bg-paper p-5 shadow-2xl shadow-ink/25">
        <h2 className="font-display text-lg font-semibold">Start Plan #{current.number + 1}?</h2>
        <p className="mt-1 text-sm text-muted">Plan #{current.number} is kept just as it is, so you can always look back at it.</p>
        <div className="mt-4 grid gap-2">
          <button
            type="button"
            autoFocus
            disabled={pending}
            onClick={() => make("copy")}
            className="rounded-control bg-accent px-4 py-2.5 text-left font-semibold text-accent-ink hover:opacity-90 disabled:opacity-60"
          >
            Copy Plan #{current.number}
            <span className="block text-xs font-normal opacity-75">Start from what you have and change it.</span>
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => make("blank")}
            className="rounded-control border border-line px-4 py-2.5 text-left font-semibold text-ink hover:bg-surface disabled:opacity-60"
          >
            Start blank
            <span className="block text-xs font-normal text-muted">A fresh, empty week.</span>
          </button>
          <button type="button" onClick={onClose} className="mt-1 rounded-control px-4 py-2 text-sm text-muted hover:text-ink">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function PlanName({ plan, run }: { plan: Plan; run: Run }) {
  return (
    <label className="mb-4 flex items-center gap-2 text-sm text-muted">
      <span className="shrink-0">Plan #{plan.number} name</span>
      <SaveInput
        value={plan.name ?? ""}
        placeholder="optional, e.g. Planche era"
        onSave={(v) => run(() => renamePlan(plan.id, v))}
        className="w-full max-w-xs"
      />
    </label>
  );
}

// ---------- A day's blocks ----------

// "Every day" and the day's name: the same espresso bar (like the top bar), same padding, so they
// line up and stand apart from the oat workout cards.
const HEADING = "flex min-w-0 items-center gap-2 rounded-control bg-accent px-4 py-2.5 text-accent-ink";

function Section({
  title,
  blocks,
  day,
  editing,
  quick,
  run,
  empty,
  today,
  foldable,
}: {
  title: string;
  blocks: Block[];
  day: Day;
  editing: boolean;
  quick: boolean; // the current plan: sets / weight can be changed with a click
  run: Run;
  empty: string;
  today?: boolean;
  foldable?: boolean; // Every day: folded to its heading until you open it
}) {
  const [open, setOpen] = useState(!foldable);
  const shown = open || editing; // editing always shows everything

  const heading = (
    <>
      {title}
      {today && <span className="rounded-full bg-accent-ink/15 px-2 py-0.5 text-xs font-semibold text-accent-ink">Today</span>}
      {foldable && !shown && blocks.length > 0 && (
        <span className="truncate text-sm font-normal opacity-65">{blocks.map((b) => b.title).join(" · ")}</span>
      )}
    </>
  );

  return (
    <div className="mb-5 last:mb-0">
      {/* Sticks just under the box's top edge while this section scrolls past (top = the bar's
          height + the 1rem top edge). The next section's heading takes over after it. */}
      <h2
        className="sticky z-10 -mx-3 bg-paper px-3 pb-2.5 pt-1 font-display text-lg font-semibold sm:-mx-5 sm:px-5"
        style={{ top: "calc(var(--sticky-top, 0px) + 1rem)" }}
      >
        {foldable && !editing ? (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={shown} className={`${HEADING} w-full text-left`}>
            {heading}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className={`ml-auto shrink-0 self-center opacity-70 transition-transform ${shown ? "rotate-180" : ""}`}
            >
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          <span className={HEADING}>{heading}</span>
        )}
      </h2>
      {shown && (
        <>
      {blocks.length === 0 && !editing && <p className="rounded-card border border-dashed border-line px-4 py-4 text-muted">{empty}</p>}
      <div className="space-y-3">
        {blocks.map((b, i) => (
          <BlockCard key={b.id} block={b} editing={editing} quick={quick} run={run} first={i === 0} last={i === blocks.length - 1} />
        ))}
      </div>
        </>
      )}
      {editing && (
        <button
          type="button"
          onClick={() => run(() => addBlock(day))}
          className="mt-3 w-full rounded-card border border-dashed border-line px-4 py-3 text-left text-sm text-muted transition-colors hover:border-ink hover:text-ink"
        >
          + Add a block{day === "daily" ? " (every day)" : ""}
        </button>
      )}
    </div>
  );
}

function BlockCard({
  block,
  editing,
  quick,
  run,
  first,
  last,
}: {
  block: Block;
  editing: boolean;
  quick: boolean;
  run: Run;
  first: boolean;
  last: boolean;
}) {
  const confirm = useConfirm();
  return (
    <article className="rounded-card bg-surface/85 px-3 py-3 sm:px-4">
      {editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <SaveInput value={block.title} placeholder="Block" onSave={(v) => run(() => updateBlock(block.id, { title: v }))} className="w-36 font-semibold" />
          <SaveInput value={block.duration ?? ""} placeholder="How long" onSave={(v) => run(() => updateBlock(block.id, { duration: v }))} className="w-28" />
          <SaveInput value={block.note ?? ""} placeholder="Note (optional)" onSave={(v) => run(() => updateBlock(block.id, { note: v }))} className="min-w-32 flex-1" />
          <div className="flex">
            <Icon label="Move block up" disabled={first} onClick={() => run(() => moveBlock(block.id, -1))}>
              <path d="M6 15l6-6 6 6" />
            </Icon>
            <Icon label="Move block down" disabled={last} onClick={() => run(() => moveBlock(block.id, 1))}>
              <path d="M6 9l6 6 6-6" />
            </Icon>
            <Icon
              label="Delete block"
              danger
              onClick={async () => {
                const ok = await confirm({ title: `Delete "${block.title}"?`, body: "Its exercises go with it.", confirmLabel: "Delete" });
                if (ok) run(() => deleteBlock(block.id));
              }}
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </Icon>
          </div>
        </div>
      ) : (
        <header className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1">
          <h3 className="font-display text-lg font-semibold">{block.title}</h3>
          {block.duration && <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-semibold text-muted">{block.duration}</span>}
          {/* The note hugs the right side. */}
          {block.note && <span className="ml-auto text-sm text-muted">{block.note}</span>}
        </header>
      )}

      <ul className="mt-2 divide-y divide-line/80">
        {block.exercises.map((x, i) => (
          <ExerciseRow key={x.id} ex={x} editing={editing} quick={quick} run={run} first={i === 0} last={i === block.exercises.length - 1} />
        ))}
      </ul>
      {block.exercises.length === 0 && !editing && <p className="px-1 py-2 text-sm text-muted">No exercises.</p>}
      {editing && (
        <button
          type="button"
          onClick={() => run(() => addExercise(block.id))}
          className="mt-2 rounded-control px-2 py-1.5 text-sm text-muted transition-colors hover:bg-paper hover:text-ink"
        >
          + Add exercise
        </button>
      )}
    </article>
  );
}

// One exercise: name | sets | weight / notes.
function ExerciseRow({
  ex,
  editing,
  quick,
  run,
  first,
  last,
}: {
  ex: Exercise;
  editing: boolean;
  quick: boolean;
  run: Run;
  first: boolean;
  last: boolean;
}) {
  if (editing) {
    return (
      <li className="flex items-center gap-2 py-1.5">
        <SaveInput value={ex.name} placeholder="Exercise" onSave={(v) => run(() => updateExercise(ex.id, { name: v }))} className="min-w-0 flex-1" />
        <SaveInput value={ex.sets ?? ""} placeholder="3 x 8" onSave={(v) => run(() => updateExercise(ex.id, { sets: v }))} className="w-20 shrink-0 sm:w-24" />
        <SaveInput value={ex.load ?? ""} placeholder="Weight" onSave={(v) => run(() => updateExercise(ex.id, { load: v }))} className="w-20 shrink-0 sm:w-24" />
        <div className="flex shrink-0">
          <Icon label="Move up" disabled={first} onClick={() => run(() => moveExercise(ex.id, -1))}>
            <path d="M6 15l6-6 6 6" />
          </Icon>
          <Icon label="Move down" disabled={last} onClick={() => run(() => moveExercise(ex.id, 1))}>
            <path d="M6 9l6 6 6-6" />
          </Icon>
          <Icon label="Delete exercise" danger onClick={() => run(() => deleteExercise(ex.id))}>
            <path d="M6 6l12 12M18 6L6 18" />
          </Icon>
        </div>
      </li>
    );
  }
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_4.5rem_3.75rem] items-baseline gap-3 px-1 py-2 sm:grid-cols-[minmax(0,1fr)_7rem_7rem]">
      <span className="break-words text-ink">{ex.name}</span>
      {quick ? (
        <>
          <QuickCell value={ex.sets ?? ""} empty="+ sets" label={`${ex.name} sets`} onSave={(v) => run(() => updateExercise(ex.id, { sets: v }))} className="font-semibold text-ink" />
          <QuickCell value={ex.load ?? ""} empty="+ weight" label={`${ex.name} weight`} onSave={(v) => run(() => updateExercise(ex.id, { load: v }))} className="text-sm text-muted" />
        </>
      ) : (
        <>
          <span className="num text-right font-semibold text-ink">{ex.sets ?? ""}</span>
          <span className="num text-right text-sm text-muted">{ex.load ?? ""}</span>
        </>
      )}
    </li>
  );
}

// ---------- Small pieces ----------

// Sets / weight outside of Edit: hover shows it's clickable (a soft box + pencil), click to type,
// Enter or click away saves, Esc cancels. Shows the new value right away.
function QuickCell({
  value,
  empty,
  label,
  onSave,
  className,
}: {
  value: string;
  empty: string; // shown on hover when there's nothing yet, e.g. "+ weight"
  label: string;
  onSave: (v: string) => void;
  className: string;
}) {
  const [editing, setEditing] = useState(false);
  const [shown, setShown] = useState(value);
  // The saved value changed (after a refresh): show that.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setShown(value);
  }

  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={shown}
        aria-label={label}
        maxLength={40}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => {
          const v = e.currentTarget.value.trim();
          setEditing(false);
          if (v !== shown) {
            setShown(v);
            onSave(v);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            e.currentTarget.value = shown;
            e.currentTarget.blur();
          }
        }}
        style={{ outline: "none" }}
        className={`num -my-1 w-full min-w-0 rounded-[8px] border border-ink bg-paper px-1.5 py-0.5 text-right ${className}`}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={`Change ${label}`}
      title="Click to change"
      className={`num group/cell -my-1 flex items-center justify-end gap-1 justify-self-end rounded-[8px] border border-transparent px-1.5 py-0.5 text-right transition-colors hover:border-line hover:bg-paper ${className}`}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-muted opacity-0 transition-opacity group-hover/cell:opacity-100">
        <path d="M4 20h4L19 9l-4-4L4 16v4z" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
      </svg>
      {shown || <span className="text-xs font-normal text-muted opacity-0 transition-opacity group-hover/cell:opacity-100">{empty}</span>}
    </button>
  );
}

// A box that saves when you leave it (or press Enter), only if it changed.
function SaveInput({ value, placeholder, onSave, className = "" }: { value: string; placeholder: string; onSave: (v: string) => void; className?: string }) {
  return (
    <input
      defaultValue={value}
      placeholder={placeholder}
      aria-label={placeholder}
      maxLength={120}
      onBlur={(e) => e.target.value.trim() !== value && onSave(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      style={{ outline: "none" }}
      className={`${field} ${className}`}
    />
  );
}

function Icon({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`grid size-8 place-items-center rounded-control text-muted transition-colors hover:bg-paper disabled:opacity-25 disabled:hover:bg-transparent ${
        danger ? "hover:text-danger" : "hover:text-ink"
      }`}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}
