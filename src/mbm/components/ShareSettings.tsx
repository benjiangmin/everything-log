"use client";

import { DatePicker } from "./DateTime";
import Select from "./Select";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pinDay, setShare, setUsername, type Share } from "@/app/mbm/social/actions";

const ITEMS: { key: keyof Share; label: string; note: string }[] = [
  { key: "now", label: "What you're doing now", note: "Your current job and how long it's been going." },
  { key: "bar", label: "Your day bar", note: "Today's jobs, start to finish." },
  { key: "days", label: "Days you pin", note: "Past days you choose, below (with their bar)." },
];

// Your account → What others see: your username, who sees each thing (name and picture always
// show), the map (close friends only), and days you pin. Private jobs show as "Busy" (Jobs).
export default function ShareSettings({ username, share, pinned, today }: { username: string | null; share: Partial<Share>; pinned: string[]; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(username ?? "");
  const [value, setValue] = useState<Share>({ now: "nobody", bar: "nobody", stats: "nobody", days: "nobody", map: "nobody", ...share } as Share);
  const [day, setDay] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const run = (f: () => Promise<{ ok: true } | { ok: false; message: string }>) =>
    start(async () => {
      const res = await f().catch(() => ({ ok: false as const, message: "That didn't save. Try again." }));
      setMessage(res.ok ? null : res.message);
      if (res.ok) router.refresh();
    });
  const change = (k: keyof Share, v: string) => {
    const next = { ...value, [k]: v };
    setValue(next);
    run(() => setShare(next));
  };

  return (
    <div className="grid gap-5">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => setUsername(name));
        }}
      >
        <span className="flex min-w-48 flex-1 items-center rounded-control border border-line bg-paper px-3 focus-within:border-ink">
          <span className="text-muted">@</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="username" aria-label="Username" className="w-full bg-transparent py-2 pl-1" style={{ outline: "none" }} />
        </span>
        <button type="submit" disabled={pending || name.trim() === (username ?? "")} className="rounded-control bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-40">
          Save username
        </button>
      </form>

      <ul className="grid gap-3">
        <li className="flex items-center justify-between gap-3 text-sm">
          <span>
            <span className="block font-semibold">Name and picture</span>
            <span className="text-muted">Always shown, so people know it&apos;s you.</span>
          </span>
          <span className="w-44 shrink-0 px-3 text-sm text-muted">Everyone</span>
        </li>
        {ITEMS.map((it) => (
          <li key={it.key} className="flex items-center justify-between gap-3 text-sm">
            <span>
              <span className="block font-semibold">{it.label}</span>
              <span className="text-muted">{it.note}</span>
            </span>
            <Select
              value={value[it.key]}
              disabled={pending}
              onChange={(v) => change(it.key, v)}
              label={it.label}
              quiet
              className="w-44 shrink-0"
              options={[
                { value: "nobody", label: "Nobody" },
                { value: "mutuals", label: "Mutuals" },
                { value: "followers", label: "Followers" },
                { value: "anyone", label: "Anyone" },
              ]}
            />
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 text-sm">
          <span>
            <span className="block font-semibold">Your map</span>
            <span className="text-muted">Where you went. Pick close friends from your followers on Social.</span>
          </span>
          <Select
            value={value.map}
            disabled={pending}
            onChange={(v) => change("map", v)}
            label="Your map"
            quiet
            className="w-44 shrink-0"
            options={[
              { value: "nobody", label: "Nobody" },
              { value: "close", label: "Close friends" },
            ]}
          />
        </li>
      </ul>

      <div>
        <p className="text-sm font-semibold">Pinned days</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {pinned.map((d) => (
            <button key={d} type="button" disabled={pending} onClick={() => run(() => pinDay(d, false))} className="flex items-center gap-1.5 rounded-full bg-surface py-1 pl-3 pr-2 text-sm font-semibold" title="Stop sharing this day">
              {d}
              <span aria-hidden="true" className="text-muted">
                ×
              </span>
            </button>
          ))}
          <DatePicker value={day} max={today} onChange={setDay} label="A day to pin" className="w-56" />
          <button
            type="button"
            disabled={pending || !day}
            onClick={() => {
              run(() => pinDay(day, true));
              setDay("");
            }}
            className="rounded-control px-3 py-2 text-sm font-semibold ring-1 ring-line hover:bg-surface disabled:opacity-40"
          >
            Pin day
          </button>
        </div>
      </div>
      {message && <p className="text-sm text-danger">{message}</p>}
    </div>
  );
}
