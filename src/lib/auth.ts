// The site's lock: one password (SITE_PASSWORD, set in .env.local and on Vercel).
// After you unlock, a cookie holds a fingerprint of the password (never the password itself).
// Changing SITE_PASSWORD signs out every browser, since old fingerprints stop matching.

export const AUTH_COOKIE = "bb_unlocked";

// How long a browser stays unlocked without using the site. Every visit starts the week over
// (see src/proxy.ts), so it only asks for the password again after a week away.
export const UNLOCK_SECONDS = 60 * 60 * 24 * 7;

export const cookieOptions = {
  httpOnly: true, // page scripts can't read it
  secure: process.env.NODE_ENV === "production", // https only on the live site
  sameSite: "lax" as const,
  path: "/",
  maxAge: UNLOCK_SECONDS,
};

// epoch: the "lock other devices" number (src/lib/lock-epoch.ts). Bumping it changes every
// fingerprint, so cookies from before stop working. 0 gives the same fingerprint as before it existed.
export async function fingerprint(password: string, epoch = 0) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(epoch ? `benbadobee-unlocked-v1-${epoch}` : "benbadobee-unlocked-v1"));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Compares without leaking where the first difference is (timing-safe).
export function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Only allow going back to a page on this site after unlocking.
export function safeNext(next: string) {
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
