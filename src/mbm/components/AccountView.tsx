"use client";

import { TimePicker } from "./DateTime";
import Link from "next/link";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { changeEmail, changePassword, deleteMine, saveAvatar, signOut } from "@/app/mbm/actions";
import type { Profile } from "@/mbm/life";
import Avatar from "./Avatar";
import { REFLECT_DEFAULT, atLabel, setReflectAt, useReflectAt } from "@/mbm/reflectAt";

const field = "w-full rounded-control border border-line bg-paper px-3 py-2.5 text-ink focus:border-ink";

// Your account: your picture and name on top, then a list of settings, each on its own page
// (/account/<section>, with a way back here).
const SECTIONS: { href: string; title: string; note: string }[] = [
  { href: "/account/about", title: "About you", note: "Birthday and the rest, for the Future page" },
  { href: "/account/sharing", title: "What others see", note: "Your username, and who sees what on Social" },
  { href: "/account/jobs", title: "Jobs and categories", note: "Color theme, places, starting by themselves" },
  { href: "/account/places", title: "Places", note: "Your places, and stops you haven't named" },
  { href: "/account/sign-in", title: "Sign-in and connections", note: "Email, password, Google" },
  { href: "/account/reflect", title: "Reflect and setup", note: "When Reflect opens, and the welcome again" },
  { href: "/account/data", title: "Your data", note: "Clear what you've recorded, or delete your account" },
];

export default function AccountView({ email, profile }: { email: string | null; profile: (Profile & { avatar?: string | null }) | null }) {
  const router = useRouter();
  return (
    <div>
      <Header email={email} profile={profile} onChange={() => router.refresh()} />
      <nav aria-label="Settings" className="mt-8 divide-y divide-line overflow-hidden rounded-card border border-line">
        {SECTIONS.map((x) => (
          <Link key={x.href} href={x.href} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface/60">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{x.title}</span>
              <span className="block truncate text-sm text-muted">{x.note}</span>
            </span>
            <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M7.5 4.5 13 10l-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        ))}
      </nav>
      <form action={signOut} className="mt-8 flex items-center justify-between gap-3">
        <button type="submit" className="rounded-control px-4 py-2.5 text-sm font-semibold text-muted ring-1 ring-line hover:bg-surface hover:text-ink">
          Sign out
        </button>
        <Link href="/privacy" className="text-sm text-muted hover:text-ink hover:underline">
          Privacy
        </Link>
      </form>
    </div>
  );
}

// One settings page: "Settings" to go back, its title, a line on what it's for, then the settings.
export function SubPage({ title, note, children, back = { href: "/account", label: "Settings" } }: { title: string; note?: string; children: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div>
      <p className="text-sm font-semibold text-muted">
        <Link href={back.href} className="inline-flex items-center gap-1 hover:text-ink">
          <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12.5 4.5 7 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {back.label}
        </Link>
      </p>
      <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      {note && <p className="mt-2 max-w-2xl text-muted">{note}</p>}
      <div className="mt-8">{children}</div>
    </div>
  );
}

export function Card({ title, note, children }: { title?: string; note?: string; children: ReactNode }) {
  return (
    <section className="mt-5 rounded-card border border-line bg-paper p-6 first:mt-0 sm:p-7">
      {title && <h2 className="font-display text-xl font-semibold">{title}</h2>}
      {note && <p className="mt-1 text-sm text-muted">{note}</p>}
      <div className={title || note ? "mt-5" : ""}>{children}</div>
    </section>
  );
}

export function SetupLinks() {
  return (
    <div className="flex flex-wrap gap-2">
      <Link href="/setup" className="rounded-control px-4 py-2 text-sm font-semibold ring-1 ring-line hover:bg-surface">
        Replay setup
      </Link>
      <Link href="/welcome?replay=1" className="rounded-control px-4 py-2 text-sm font-semibold text-muted hover:bg-surface hover:text-ink">
        See the welcome
      </Link>
    </div>
  );
}

function Header({ email, profile, onChange }: { email: string | null; profile: (Profile & { avatar?: string | null }) | null; onChange: () => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  // Shrunk in the browser to 192 px, so it's small enough to keep with your profile.
  const pick = (f: File) =>
    start(async () => {
      try {
        const url = await shrink(f, 192);
        const res = await saveAvatar(url);
        setMessage(res.ok ? null : res.message);
        if (res.ok) onChange();
      } catch {
        setMessage("That picture couldn't be read.");
      }
    });
  return (
    <header className="flex flex-wrap items-center gap-5">
      <button type="button" onClick={() => file.current?.click()} className="group relative rounded-full" aria-label="Change your picture">
        <Avatar src={profile?.avatar} name={profile?.name} email={email} size={84} />
        <span className="absolute inset-0 grid place-items-center rounded-full bg-ink/45 text-xs font-semibold text-paper opacity-0 transition-opacity group-hover:opacity-100">
          {pending ? "Saving…" : "Change"}
        </span>
      </button>
      <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{profile?.name || "Settings"}</h1>
        <p className="text-muted">{email}</p>
        {profile?.avatar && (
          <button type="button" onClick={() => start(async () => { await saveAvatar(""); onChange(); })} className="mt-1 text-sm text-muted underline-offset-2 hover:text-ink hover:underline">
            Remove picture
          </button>
        )}
        {message && <p role="alert" className="mt-1 text-sm text-danger">{message}</p>}
      </div>
    </header>
  );
}

export function ReflectTime() {
  const at = useReflectAt();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm font-semibold">Opens at</span>
      <TimePicker value={at} onChange={(v) => v && setReflectAt(v)} label="Reflect opens at" />
      {at !== REFLECT_DEFAULT && (
        <button type="button" onClick={() => setReflectAt(REFLECT_DEFAULT)} className="text-sm text-muted underline-offset-2 hover:text-ink hover:underline">
          Back to {atLabel(REFLECT_DEFAULT)}
        </button>
      )}
    </div>
  );
}

export function EmailForm({ email }: { email: string | null }) {
  const [value, setValue] = useState(email ?? "");
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await changeEmail(value);
          setNote(res.ok ? { ok: true, text: `Check ${value} for a link to confirm the change.` } : { ok: false, text: res.message });
        });
      }}
      className="grid gap-2"
    >
      <label className="text-sm font-semibold" htmlFor="acct-email">Email</label>
      <div className="flex gap-2">
        <input id="acct-email" type="email" value={value} onChange={(e) => setValue(e.target.value)} className={field} style={{ outline: "none" }} />
        <button type="submit" disabled={pending || value.trim() === (email ?? "")} className="shrink-0 rounded-control bg-accent px-4 font-semibold text-accent-ink disabled:opacity-40">
          {pending ? "Sending…" : "Change email"}
        </button>
      </div>
      {note && <p className={`text-sm ${note.ok ? "text-muted" : "text-danger"}`}>{note.text}</p>}
    </form>
  );
}

export function PasswordForm() {
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await changePassword(value);
          setNote(res.ok ? { ok: true, text: "Password changed." } : { ok: false, text: res.message });
          if (res.ok) setValue("");
        });
      }}
      className="grid gap-2"
    >
      <label className="text-sm font-semibold" htmlFor="acct-pw">New password</label>
      <div className="flex gap-2">
        <input id="acct-pw" type="password" autoComplete="new-password" placeholder="8+ characters" value={value} onChange={(e) => setValue(e.target.value)} className={field} style={{ outline: "none" }} />
        <button type="submit" disabled={pending || value.length < 8} className="shrink-0 rounded-control bg-accent px-4 font-semibold text-accent-ink disabled:opacity-40">
          {pending ? "Saving…" : "Change password"}
        </button>
      </div>
      {note && <p className={`text-sm ${note.ok ? "text-muted" : "text-danger"}`}>{note.text}</p>}
    </form>
  );
}

// Two ways out, each behind typing "delete".
export function Danger() {
  const [open, setOpen] = useState<"data" | "account" | null>(null);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const router = useRouter();
  const what = {
    data: { button: "Clear all my data", says: "Every entry, stop, route and place you've recorded will be deleted. Your account stays, so you can start fresh." },
    account: { button: "Delete my account", says: "Your account and everything in it will be deleted for good, on the website and the phone." },
  };
  return (
    <div className="grid gap-3">
      {(["data", "account"] as const).map((k) => (
        <div key={k} className="rounded-control border border-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-md text-sm text-muted">{what[k].says}</p>
            {open !== k && (
              <button type="button" onClick={() => { setOpen(k); setTyped(""); setNote(null); }} className="rounded-control px-4 py-2 text-sm font-semibold text-danger ring-1 ring-danger/40 hover:bg-danger/10">
                {what[k].button}
              </button>
            )}
          </div>
          {open === k && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const res = await deleteMine(k, typed);
                  if (!res.ok) return setNote(res.message);
                  setOpen(null);
                  setNote(k === "data" ? "All cleared." : null);
                  router.refresh();
                });
              }}
              className="mt-3 flex flex-wrap items-center gap-2"
            >
              <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder='Type "delete"' className={`${field} max-w-48`} style={{ outline: "none" }} />
              <button type="submit" disabled={pending || typed.trim().toLowerCase() !== "delete"} className="rounded-control bg-danger px-4 py-2.5 text-sm font-semibold text-paper disabled:opacity-40">
                {pending ? "Deleting…" : what[k].button}
              </button>
              <button type="button" onClick={() => setOpen(null)} className="rounded-control px-3 py-2.5 text-sm text-muted hover:bg-surface">
                Cancel
              </button>
            </form>
          )}
        </div>
      ))}
      {note && <p className="text-sm text-muted">{note}</p>}
    </div>
  );
}

function shrink(f: File, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = size;
      c.height = size;
      const s = Math.min(img.width, img.height); // (the middle square)
      c.getContext("2d")!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      resolve(c.toDataURL("image/jpeg", 0.85));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(f);
  });
}
