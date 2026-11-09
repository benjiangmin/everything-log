import "server-only";
import { cookies } from "next/headers";
import { AUTH_COOKIE, fingerprint, sameText } from "@/lib/auth";
import { getLockEpoch } from "@/lib/lock-epoch";

// Minute by Minute is its own app: nothing in it points to the everything-log, except for you.
// "You" = this browser is unlocked for the everything-log (its own site password cookie). Anyone
// else using Minute by Minute never sees a link to it.
export async function isEverythingLogOwner() {
  const password = process.env.SITE_PASSWORD;
  if (!password) return process.env.NODE_ENV !== "production"; // developing on your computer
  const cookie = (await cookies()).get(AUTH_COOKIE)?.value;
  return Boolean(cookie && sameText(cookie, await fingerprint(password, await getLockEpoch())));
}
