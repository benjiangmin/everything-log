import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Minute by Minute has its own Supabase project ("minute-by-minute"), separate from the
// everything-log's, so it can become its own app later. You sign in to it (email + password);
// every row belongs to you and Supabase's row level security keeps it that way, so the iPhone
// app can use the same database directly.
//
// Environment variables (Vercel → Settings → Environment Variables, and .env.local):
//   MBM_SUPABASE_URL              the project's URL
//   MBM_SUPABASE_PUBLISHABLE_KEY  the project's publishable key (sb_publishable_…)
//   MBM_TIMEZONE                  optional, defaults to America/Chicago (where "midnight" is)

export const mbmReady = () => Boolean(process.env.MBM_SUPABASE_URL && process.env.MBM_SUPABASE_PUBLISHABLE_KEY);

// A client acting as you (from your sign-in cookies). In a page it can read; in a server action
// it can also refresh your sign-in (the proxy keeps it fresh on every visit too).
export async function mbm() {
  const store = await cookies();
  return createServerClient(process.env.MBM_SUPABASE_URL!, process.env.MBM_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // In a page (not an action) cookies can't be written; the proxy handles refreshing.
        }
      },
    },
  });
}

// Who's signed in (checked properly, not just read from the cookie), or null.
export async function mbmUser() {
  if (!mbmReady()) return null;
  const client = await mbm();
  const { data } = await client.auth.getClaims();
  return data?.claims?.sub ? { id: data.claims.sub as string, email: (data.claims.email as string | undefined) ?? null } : null;
}
