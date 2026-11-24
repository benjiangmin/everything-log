"use client";

import { DatePicker } from "./DateTime";
import Select from "./Select";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveProfile } from "@/app/mbm/actions";
import { EDUCATION, EXERCISE, RACES, SMOKING, STATES, type Profile } from "@/mbm/life";

const field = "w-full rounded-control border border-line bg-paper px-3 py-2.5 text-ink focus:border-ink";

// Name, birthday, sex, group and state: what U.S. life tables are broken down by. All optional
// (each one you leave out uses everyone's average instead).
export default function AboutYouForm({ profile, onDone }: { profile: Profile | null; onDone?: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      action={(fd) =>
        start(async () => {
          const res = await saveProfile(fd);
          if (!res.ok) return setMessage(res.message);
          setMessage(null);
          onDone?.();
          router.refresh();
        })
      }
      className="grid gap-4 sm:grid-cols-2"
    >
      <label className="grid gap-1.5 text-sm font-semibold">
        Name
        <input name="name" defaultValue={profile?.name ?? ""} autoComplete="given-name" placeholder="What should we call you?" className={field} style={{ outline: "none" }} />
      </label>
      <label className="grid gap-1.5 text-sm font-semibold">
        Birthday
        <DatePicker name="birthday" defaultValue={profile?.birthday ?? ""} max={new Date().toISOString().slice(0, 10)} label="Birthday" placeholder="Pick your birthday" />
      </label>
      <fieldset className="grid gap-1.5 text-sm font-semibold">
        <legend className="mb-1.5">Sex</legend>
        <div className="flex gap-2">
          {(["female", "male"] as const).map((s) => (
            <label key={s} className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-control border border-line px-3 py-2.5 font-normal has-[:checked]:border-ink has-[:checked]:bg-surface has-[:checked]:font-semibold">
              <input type="radio" name="sex" value={s} defaultChecked={profile?.sex === s} className="sr-only" />
              {s === "female" ? "Female" : "Male"}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="grid gap-1.5 text-sm font-semibold">
        Race or ethnicity
        <Select name="race" defaultValue={profile?.race ?? ""} options={[{ value: "", label: "Choose…" }, ...RACES.map((r) => ({ value: r.id, label: r.label }))]} />
      </label>
      <label className="grid gap-1.5 text-sm font-semibold sm:col-span-2">
        State you live in
        <Select name="state" defaultValue={profile?.state ?? ""} options={[{ value: "", label: "Choose…" }, ...Object.keys(STATES).map((s) => ({ value: s, label: s }))]} />
      </label>
      {(
        [
          ["education", "School", EDUCATION, profile?.education],
          ["smoking", "Smoking", SMOKING, profile?.smoking],
          ["exercise", "Exercise", EXERCISE, profile?.exercise],
        ] as const
      ).map(([key, label, options, value]) => (
        <label key={key} className={`grid gap-1.5 text-sm font-semibold ${key === "exercise" ? "sm:col-span-2" : ""}`}>
          {label}
          <Select name={key} defaultValue={value ?? ""} options={[{ value: "", label: "Choose…" }, ...options.map((o) => ({ value: o.id, label: o.label }))]} />
        </label>
      ))}
      <p className="text-xs text-muted sm:col-span-2">
        Only used here, to pick the right life table. Anything you leave out uses everyone&apos;s average. Life tables only come by female and male.
      </p>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className="h-11 rounded-control bg-accent px-5 font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className="h-11 rounded-control px-4 text-sm font-semibold text-muted hover:bg-surface hover:text-ink">
            Cancel
          </button>
        )}
        {message && (
          <p role="alert" className="text-sm text-danger">
            {message}
          </p>
        )}
      </div>
    </form>
  );
}
