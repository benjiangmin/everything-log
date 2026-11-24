import "server-only";
import { cookies } from "next/headers";
import { AUTH_COOKIE, fingerprint, sameText } from "@/lib/auth";
import { getLockEpoch } from "@/lib/lock-epoch";

// Minute by Minute is its own app: nothing in it points to the everything-log, except for you.
// "You" = this browser is unlocked for the everything-log (its own site password cookie). Anyone
// else using Minute by Minute never sees a link to it.
export async function isEverythingLogOwner() {
  // On Minute by Minute's own domain the everything-log's cookie isn't there: you're you when
  // you're signed in with your account (MBM_OWNER_EMAIL, set in Vercel).
  const owner = process.env.MBM_OWNER_EMAIL?.trim().toLowerCase();
  if (owner) {
    const { mbmUser } = await import("./supabase");
    const me = await mbmUser().catch(() => null);
    if (me?.email?.toLowerCase() === owner) return true;
  }
  const password = process.env.SITE_PASSWORD;
  if (!password) return process.env.NODE_ENV !== "production"; // developing on your computer
  const cookie = (await cookies()).get(AUTH_COOKIE)?.value;
  return Boolean(cookie && sameText(cookie, await fingerprint(password, await getLockEpoch())));
}
