"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signUp, type SignInState } from "../actions";
import CodeEntry from "@/mbm/components/CodeEntry";
import { Badge, Clock, Dots, Points, Primary, Secondary, Slide, Stage } from "@/mbm/components/setup/Slides";

const field = "w-full rounded-control border border-line bg-paper px-4 py-3 text-ink placeholder:text-muted/70 focus:border-ink";
const SLIDES = 5; // welcome, "what did you do yesterday?", the number, what it does, your account

// Before there's an account: welcome, why, what it does, then making the account (Google, or an
// email and password). Then the setup (/mbm/setup) asks about you. The phone's setup is the same
// slides in the same order (ContentView.swift).
export default function WelcomeFlow({ google = null }: { google?: string | null }) {
  const [at, setAt] = useState(0);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [email, setEmail] = useState("");
  const [state, action, pending] = useActionState<SignInState, FormData>(signUp, { message: null });
  const go = (to: number) => {
    setDir(to > at ? "fwd" : "back");
    setAt(to);
  };

  if (state.sent)
    return (
      <Stage>
        <Slide
          dir="fwd"
          top={
            <Badge>
              <path d="M4 6h16v12H4z" />
              <path d="M4 7l8 6 8-6" />
            </Badge>
          }
          title="Check your email"
          body={
            <>
              We sent a code to <span className="font-semibold text-ink">{state.email || email || "your email"}</span>. Type it here (or tap the button in the email) and you&apos;re in.
            </>
          }
        >
          <CodeEntry sent={state} big />
        </Slide>
      </Stage>
    );

  return (
    <Stage back={at > 0} onBack={() => go(at - 1)}>
      <div className="mb-8">
        <Dots at={at} of={SLIDES} />
      </div>
      <div key={at}>
        {at === 0 && (
          <Slide
            dir={dir}
            top={<Clock />}
            title="Welcome to Minute by Minute"
            body="Your days, written down for you, minute by minute."
            actions={
              <>
                <Primary onClick={() => go(1)}>Get started</Primary>
                <Secondary href="/login">I have an account</Secondary>
              </>
            }
          />
        )}
        {at === 1 && (
          <Slide
            dir={dir}
            title="What did you do yesterday?"
            body="Someone asks, and you come up blank. Or you've wondered how much of your week goes to getting places."
            actions={<Primary onClick={() => go(2)}>Next</Primary>}
          >
            <ul className="grid gap-3">
              {["Where did the afternoon go?", "How long is my commute, really?", "When did I last get to the gym?"].map((q, i) => (
                <li key={q} className="setup-rise rounded-card bg-paper px-4 py-3 font-semibold ring-1 ring-line" style={{ animationDelay: `${120 + i * 110}ms` }}>
                  {q}
                </li>
              ))}
            </ul>
          </Slide>
        )}
        {at === 2 && (
          <Slide
            dir={dir}
            top={<p className="setup-count font-display text-7xl font-semibold tracking-tight text-accent sm:text-8xl">5–10%</p>}
            title="We don't know where our time goes"
            body={
              <>
                <p>People asked how much they work overestimate it by 5 to 10 percent, compared with writing each day down as it happened.</p>
                <p className="mt-3 font-semibold text-ink">Minute by Minute writes it down for you.</p>
              </>
            }
            actions={
              <>
                <p className="text-xs text-muted">Source: U.S. Bureau of Labor Statistics, Monthly Labor Review (2011).</p>
                <Primary onClick={() => go(3)}>Next</Primary>
              </>
            }
          />
        )}
        {at === 3 && (
          <Slide
            dir={dir}
            title="What it does"
            actions={<Primary onClick={() => go(4)}>Next</Primary>}
          >
            <Points
              items={[
                { icon: <path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.4-6.5 11-6.5 11Z M12 12.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6Z" />, title: "Your day fills itself in", text: "Your phone notices where you are and how you got there." },
                { icon: <path d="M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15.5l-1.8-4.7L5.5 9l4.7-1.3L12 3Z M18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9L18 15Z" />, title: "It guesses what you're doing", text: "Arrive somewhere and it asks. One tap to answer, even from the lock screen." },
                { icon: <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z M9 4v14 M15 6v14" />, title: "Every route, on a map", text: "Walks, drives and bus rides, drawn the way you went." },
                { icon: <path d="M4 20V10 M10 20V4 M16 20v-7 M22 20H2" />, title: "See where the time went", text: "Stats for any day, week or year, and Reflect replays your day." },
              ]}
            />
          </Slide>
        )}
        {at === 4 && (
          <Slide
            dir={dir}
            title="Make your account"
            body="One account for the website and the phone app."
            actions={
              <p className="text-center text-sm text-muted">
                Have an account?{" "}
                <Link href="/login" className="font-semibold text-ink hover:underline">
                  Sign in
                </Link>
              </p>
            }
          >
            <a
              href="/google/signin?next=%2Fsetup&calendar=1"
              className="flex h-12 items-center justify-center gap-3 rounded-control border border-line bg-paper font-semibold text-ink transition-colors hover:bg-surface"
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
              </svg>
              Continue with Google
            </a>
            {google && google !== "connected" && (
              <p role="alert" className="mt-2 text-sm text-danger">
                {google === "cancelled" ? "Google sign-in was cancelled." : google.startsWith("error:") ? google.slice(6) : "That didn't go through. Try again."}
              </p>
            )}
            <div className="my-5 flex items-center gap-3 text-xs text-muted">
              <span className="h-px flex-1 bg-line" />
              or with email
              <span className="h-px flex-1 bg-line" />
            </div>
            <form action={action} className="flex flex-col gap-3">
              <input type="hidden" name="next" value="/setup" />
              <input name="email" type="email" required autoComplete="email" placeholder="Email" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} style={{ outline: "none" }} />
              <input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="Password (8+ characters)" aria-label="Password" className={field} style={{ outline: "none" }} />
              <Primary type="submit" disabled={pending}>
                {pending ? "Making your account…" : "Create account"}
              </Primary>
              {state.message && (
                <p role="alert" className="text-sm text-danger">
                  {state.message}
                </p>
              )}
            </form>
          </Slide>
        )}
      </div>
    </Stage>
  );
}
