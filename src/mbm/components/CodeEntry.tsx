"use client";

import { useActionState, useState, useTransition } from "react";
import { confirmCode, resendCode, type SignInState } from "@/app/mbm/actions";

// After making an account: type the code from the confirmation email (or tap its link). Right:
// signed in, and on into the setup. Also: send a new code.
export default function CodeEntry({ sent, big = false }: { sent: SignInState; big?: boolean }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(confirmCode, { ...sent, message: null });
  const [code, setCode] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [resending, startResend] = useTransition();
  return (
    <form action={action} className="grid gap-3">
      <input
        name="code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        placeholder="000000"
        aria-label="Code from the email"
        className={`num w-full rounded-control border border-line bg-paper text-center tracking-[0.4em] text-ink placeholder:text-muted/40 focus:border-ink ${
          big ? "py-4 font-display text-3xl font-semibold" : "py-3 text-xl font-semibold"
        }`}
        style={{ outline: "none" }}
      />
      <button
        type="submit"
        disabled={pending || code.length < 6}
        className="flex h-12 items-center justify-center rounded-control bg-accent px-6 font-semibold text-accent-ink transition-[opacity,transform] hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
      >
        {pending ? "Checking…" : "Confirm"}
      </button>
      {(state.message || note) && (
        <p role="alert" className={`text-sm ${state.message ? "text-danger" : "text-muted"}`}>
          {state.message ?? note}
        </p>
      )}
      <button
        type="button"
        disabled={resending || !sent.email}
        onClick={() =>
          startResend(async () => {
            const res = await resendCode(sent.email ?? "");
            setNote(res.message);
          })
        }
        className="justify-self-center text-sm font-semibold text-muted hover:text-ink disabled:opacity-50"
      >
        {resending ? "Sending…" : "Send a new code"}
      </button>
    </form>
  );
}
