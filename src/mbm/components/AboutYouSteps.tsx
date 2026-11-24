"use client";

import { DatePicker } from "./DateTime";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { saveProfile } from "@/app/mbm/actions";
import { EDUCATION, EXERCISE, RACES, SMOKING, STATES } from "@/mbm/life";

// The first time: one question at a time, sliding to the next (like the phone's setup). Every
// one can be skipped. All of them at once, later: "Edit your details" (AboutYouForm).
type Answers = { name: string; birthday: string; sex: string; race: string; state: string; education: string; smoking: string; exercise: string };
const STEPS = 8;

// initialName: from Google, to confirm. onDone: in the setup (/mbm/setup), the next slide.
export default function AboutYouSteps({ initialName = "", onDone }: { initialName?: string; onDone?: () => void } = {}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [a, setA] = useState<Answers>({ name: initialName, birthday: "", sex: "", race: "", state: "", education: "", smoking: "", exercise: "" });
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => input.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [step]);

  const go = (to: number) => {
    if (to < 0 || to >= STEPS) return;
    setDir(to > step ? "fwd" : "back");
    setStep(to);
  };
  const set = (k: keyof Answers, v: string, then?: number) => {
    const next = { ...a, [k]: v };
    setA(next);
    if (then === undefined) return;
    if (then >= STEPS) finish(next);
    else go(then);
  };
  const finish = (ans: Answers) =>
    start(async () => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(ans)) fd.set(k, v);
      const res = await saveProfile(fd);
      if (!res.ok) return setMessage(res.message);
      if (onDone) onDone();
      else router.refresh();
    });

  const states = Object.keys(STATES).filter((s) => !search || s.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="overflow-hidden">
      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => go(step - 1)}
          className={`rounded-control px-2 py-1 font-semibold text-muted hover:bg-surface hover:text-ink ${step ? "" : "invisible"}`}
        >
          ← Back
        </button>
        <span className="font-semibold text-muted">
          {step + 1} of {STEPS}
        </span>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${((step + 1) / STEPS) * 100}%` }} />
      </div>

      <div key={step} className={dir === "fwd" ? "step-in-fwd" : "step-in-back"}>
        {step === 0 && (
          <Ask title="What should we call you?" hint="Just a first name is fine.">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                go(1);
              }}
            >
              <input
                ref={input}
                value={a.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Your name"
                autoComplete="given-name"
                className="w-full border-b border-line bg-transparent py-3 font-display text-3xl font-semibold text-ink placeholder:text-muted/50 focus:border-ink"
                style={{ outline: "none" }}
              />
              <Next>{a.name.trim() ? "Continue" : "Not now"}</Next>
            </form>
          </Ask>
        )}
        {step === 1 && (
          <Ask title="When's your birthday?" hint="Your age is where the bar starts.">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (a.birthday) go(2);
              }}
            >
              <DatePicker big value={a.birthday} max={new Date().toISOString().slice(0, 10)} onChange={(v) => set("birthday", v)} label="Birthday" placeholder="Pick your birthday" />
              <Next disabled={!a.birthday}>Continue</Next>
            </form>
            <Skip onClick={() => set("birthday", "", 2)}>Set up later</Skip>
          </Ask>
        )}
        {step === 2 && (
          <Ask title="Sex" hint="U.S. life tables come by female and male.">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Choice on={a.sex === "female"} onClick={() => set("sex", "female", 3)}>
                Female
              </Choice>
              <Choice on={a.sex === "male"} onClick={() => set("sex", "male", 3)}>
                Male
              </Choice>
            </div>
            <Skip onClick={() => set("sex", "", 3)}>Rather not say</Skip>
          </Ask>
        )}
        {step === 3 && (
          <Ask title="Race or ethnicity" hint="Life expectancy differs between groups, so this makes the estimate closer.">
            <div className="grid gap-2.5">
              {RACES.map((r) => (
                <Choice key={r.id} on={a.race === r.id} onClick={() => set("race", r.id, 4)}>
                  {r.label}
                </Choice>
              ))}
            </div>
            <Skip onClick={() => set("race", "", 4)}>Set up later</Skip>
          </Ask>
        )}
        {step === 4 && (
          <Ask title="Which state do you live in?" hint="Where you live changes it too.">
            <input
              ref={input}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && states.length === 1 && set("state", states[0], 5)}
              placeholder="Search"
              className="w-full rounded-control border border-line bg-surface px-3 py-2.5 focus:border-ink"
              style={{ outline: "none" }}
            />
            <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto pr-1 [scrollbar-width:thin] sm:grid-cols-2">
              {states.map((s) => (
                <Choice key={s} on={a.state === s} onClick={() => set("state", s, 5)}>
                  {s}
                </Choice>
              ))}
            </div>
            <Skip onClick={() => set("state", "", 5)}>Not in the U.S. / set up later</Skip>
          </Ask>
        )}
        {step === 5 && (
          <Ask title="How far did you go in school?" hint="One of the biggest differences in how long people live. Still in college counts as your degree.">
            <div className="grid gap-2.5">
              {EDUCATION.map((x) => (
                <Choice key={x.id} on={a.education === x.id} onClick={() => set("education", x.id, 6)}>
                  {x.label}
                </Choice>
              ))}
            </div>
            <Skip onClick={() => set("education", "", 6)}>Set up later</Skip>
          </Ask>
        )}
        {step === 6 && (
          <Ask title="Do you smoke?" hint="Smoking takes about ten years off, on average. Quitting young gives most of them back.">
            <div className="grid gap-2.5 sm:grid-cols-3">
              {SMOKING.map((x) => (
                <Choice key={x.id} on={a.smoking === x.id} onClick={() => set("smoking", x.id, 7)}>
                  {x.label}
                </Choice>
              ))}
            </div>
            <Skip onClick={() => set("smoking", "", 7)}>Set up later</Skip>
          </Ask>
        )}
        {step === 7 && (
          <Ask title="How much do you exercise?" hint="Anything that gets you breathing harder counts, a brisk walk included.">
            <div className="grid gap-2.5 sm:grid-cols-2">
              {EXERCISE.map((x) => (
                <Choice key={x.id} on={a.exercise === x.id} onClick={() => set("exercise", x.id, STEPS)}>
                  {x.label}
                </Choice>
              ))}
            </div>
            <Skip onClick={() => set("exercise", "", STEPS)}>{pending ? "Saving…" : "Set up later"}</Skip>
            {message && (
              <p role="alert" className="mt-3 text-sm text-danger">
                {message}
              </p>
            )}
          </Ask>
        )}
      </div>
    </div>
  );
}

function Ask({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="pt-8">
      <h2 className="font-display text-3xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1.5 text-muted">{hint}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function Next({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  return (
    <button type="submit" disabled={disabled} className="mt-6 h-11 rounded-control bg-accent px-6 font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-40">
      {children} <span aria-hidden="true">→</span>
    </button>
  );
}

function Skip({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mt-4 rounded-control px-3 py-2 text-sm font-semibold text-muted hover:bg-surface hover:text-ink">
      {children}
    </button>
  );
}

function Choice({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-14 items-center justify-between gap-3 rounded-control border px-4 py-3 text-left font-semibold transition-colors ${
        on ? "border-ink bg-surface" : "border-line hover:border-ink/40 hover:bg-surface/60"
      }`}
    >
      {children}
      {on && <span aria-hidden="true">✓</span>}
    </button>
  );
}
