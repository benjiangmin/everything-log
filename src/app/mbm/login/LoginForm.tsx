"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signIn, signUp, type SignInState } from "../actions";
import { MBM_ORIGIN } from "@/mbm/paths";

const field = "w-full rounded-control border border-line bg-paper px-3 py-2.5 text-ink placeholder:text-muted/70 focus:border-ink";

// Sign in, or make an account (the same account works in the phone app).
// home: on Minute by Minute's own domain (else the everything-log home's sign-in on benbadobee.com,
// where its pages are under /mbm and making an account is on the new address).
export default function LoginForm({ next, google = null, home = true }: { next: string; google?: string | null; home?: boolean }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [inState, inAction, inPending] = useActionState<SignInState, FormData>(signIn, { message: null });
  const [upState, upAction, upPending] = useActionState<SignInState, FormData>(signUp, { message: null });
  const up = mode === "up";
  const state = up ? upState : inState;
  const pending = up ? upPending : inPending;

  if (up && upState.sent) {
    return (
      <div className="mt-6 rounded-control bg-paper p-4 text-sm text-ink">
        <p className="font-semibold">Check your email.</p>
        <p className="mt-1 text-muted">Tap the link we sent to confirm your account, then sign in here and in the phone app.</p>
        <button type="button" onClick={() => setMode("in")} className="mt-3 font-semibold text-accent hover:underline">
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <>
    <GoogleButton next={next} note={google} base={home ? "" : "/mbm"} />
    <div className="my-5 flex items-center gap-3 text-xs text-muted">
      <span className="h-px flex-1 bg-line" />
      or with email
      <span className="h-px flex-1 bg-line" />
    </div>
    <form action={up ? upAction : inAction} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <input name="email" type="email" required autoComplete="email" placeholder="Email" aria-label="Email" className={field} style={{ outline: "none" }} />
      <input
        name="password"
        type="password"
        required
        minLength={up ? 8 : undefined}
        autoComplete={up ? "new-password" : "current-password"}
        placeholder={up ? "Password (8+ characters)" : "Password"}
        aria-label="Password"
        className={field}
        style={{ outline: "none" }}
      />
      <button type="submit" disabled={pending} className="h-11 rounded-control bg-accent font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60">
        {up ? (pending ? "Making your account…" : "Create account") : pending ? "Signing in…" : "Sign in"}
      </button>
      {state.message && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      <p className="text-center text-sm text-muted">
        {up ? "Have an account? " : "New here? "}
        {up ? (
          <button type="button" onClick={() => setMode("in")} className="font-semibold text-ink hover:underline">
            Sign in
          </button>
        ) : (
          // (Making an account goes through the welcome: /mbm/welcome.)
          <Link href={home ? "/welcome" : `${MBM_ORIGIN}/welcome`} className="font-semibold text-ink hover:underline">
            Create an account
          </Link>
        )}
      </p>
    </form>
    </>
  );
}

// "Continue with Google", your calendar connected in the same step (no box to tick).
function GoogleButton({ next, note, base }: { next: string; note: string | null; base: string }) {
  const href = `${base}/google/signin?${new URLSearchParams({ next, calendar: "1" })}`;
  const problem =
    note === "cancelled" ? "Google sign-in was cancelled." : note === "try-again" ? "That didn't go through. Try again." : note === "not-set-up" ? "Google sign-in isn't set up on this site yet." : note?.startsWith("error:") ? note.slice(6) : null;
  return (
    <div className="mt-6">
      <a
        href={href}
        className="flex h-11 items-center justify-center gap-3 rounded-control border border-line bg-paper font-semibold text-ink transition-colors hover:bg-surface"
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
        Continue with Google
      </a>
      {problem && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {problem}
        </p>
      )}
    </div>
  );
}
