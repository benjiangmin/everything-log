"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type SignInState } from "../actions";

const field = "w-full rounded-control border border-line bg-paper px-3 py-2.5 text-ink placeholder:text-muted/70 focus:border-ink";

// Sign in, or make an account (the same account works in the phone app).
export default function LoginForm({ next }: { next: string }) {
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
    <form action={up ? upAction : inAction} className="mt-6 flex flex-col gap-3">
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
        <button type="button" onClick={() => setMode(up ? "in" : "up")} className="font-semibold text-ink hover:underline">
          {up ? "Sign in" : "Create an account"}
        </button>
      </p>
    </form>
  );
}
