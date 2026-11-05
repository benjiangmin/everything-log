"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "../actions";

const field = "w-full rounded-control border border-line bg-paper px-3 py-2.5 text-ink placeholder:text-muted/70 focus:border-ink";

export default function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, { message: null });
  return (
    <form action={action} className="mt-6 flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <input name="email" type="email" required autoComplete="email" placeholder="Email" aria-label="Email" className={field} style={{ outline: "none" }} />
      <input
        name="password"
        type="password"
        required
        autoComplete="current-password"
        placeholder="Password"
        aria-label="Password"
        className={field}
        style={{ outline: "none" }}
      />
      <button type="submit" disabled={pending} className="h-11 rounded-control bg-accent font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60">
        {pending ? "Signing in…" : "Sign in"}
      </button>
      {state.message && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
    </form>
  );
}
