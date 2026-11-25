import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = { title: "Privacy · Minute by Minute" };

// The privacy policy (minutexminute.com/privacy): what the app collects, where it's kept, who can
// see it, and how to delete it. Linked from sign-in, Your account, Apple and Google.
const UPDATED = "November 24, 2026";

export default function PrivacyPage() {
  const contact = process.env.MBM_OWNER_EMAIL?.trim();
  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-24 pt-12 sm:pt-16">
      <p className="text-sm font-semibold text-muted">
        <Link href="/" className="hover:text-ink">
          Minute by Minute
        </Link>
      </p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Privacy</h1>
      <p className="mt-2 text-sm text-muted">Last updated {UPDATED}</p>

      <p className="mt-8 text-lg leading-relaxed">
        Minute by Minute records where your time goes, including where you go. That&apos;s personal, so here&apos;s exactly what it keeps, who can see it, and how to
        get rid of it. Short version: it&apos;s yours, it isn&apos;t sold or used for ads, and you can delete all of it at any time.
      </p>

      <Part title="What it collects">
        <List
          items={[
            ["Your account", "your email, a password (stored scrambled, never readable), and if you add them: your name, picture and username."],
            [
              "Your location",
              "while location tracking is on, the phone records where you are, the routes between places, and how you moved (walking, driving and so on), including when the app is closed. You can turn it off in Settings at any time.",
            ],
            ["What you do", "the jobs you start and stop, their times, places you name, and anything you type in."],
            ["Your calendar", "if you connect Google Calendar: your events, read only. Minute by Minute never changes your calendar."],
            ["Your sleep", "if you allow it: sleep times from Apple Health, read only."],
            ["Your phone use", "if you set up the Shortcuts automation: which apps you open and when. Not what you do in them."],
            ["About you", "if you fill it in: birthday, sex, state, and the other Future page answers. All optional."],
          ]}
        />
      </Part>

      <Part title="What it's used for">
        <p>
          Only to show you your own days: your timeline, map, stats, suggestions and notifications. Nothing is sold, shared with advertisers, or used to train AI.
        </p>
      </Part>

      <Part title="Where it's kept">
        <List
          items={[
            ["Supabase", "the database that holds your account and everything above. Each account can only read its own data."],
            ["Vercel", "runs the website."],
            ["Google", "Google Maps draws your maps, and Google Calendar and Google sign-in are used only if you choose them."],
            ["Your phone", "keeps recent location data before it's sent."],
          ]}
        />
        <p className="mt-3">Data is sent over encrypted connections and stored encrypted.</p>
      </Part>

      <Part title="Who can see it">
        <List
          items={[
            ["You", "everything."],
            [
              "People on Social",
              "only what you choose in What others see. Your name and picture always show. Everything else starts as Nobody. Your map only ever goes to close friends you pick.",
            ],
            [
              "The person who runs Minute by Minute",
              "Minute by Minute is a small project run by one person, who can access the database to keep it running and fix problems. It isn't looked at otherwise.",
            ],
          ]}
        />
      </Part>

      <Part title="Deleting it">
        <p>
          In the app (Profile) or on the website (Settings → Your data) you can clear everything you&apos;ve recorded, or delete your account. Deleting is immediate
          and can&apos;t be undone: your account and all of its data are removed, and you&apos;re signed out everywhere.
        </p>
      </Part>

      <Part title="Questions">
        <p>
          {contact ? (
            <>
              Email{" "}
              <a href={`mailto:${contact}`} className="font-semibold underline underline-offset-2">
                {contact}
              </a>
              .
            </>
          ) : (
            "Ask the person who invited you."
          )}{" "}
          If this policy changes, the date at the top changes too.
        </p>
      </Part>
    </main>
  );
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <div className="mt-3 leading-relaxed text-ink/90">{children}</div>
    </section>
  );
}

function List({ items }: { items: [string, string][] }) {
  return (
    <ul className="grid gap-2.5">
      {items.map(([k, v]) => (
        <li key={k}>
          <span className="font-semibold">{k}:</span> {v}
        </li>
      ))}
    </ul>
  );
}
