"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, cookieOptions, fingerprint, safeNext, sameText } from "@/lib/auth";
import { bumpLockEpoch, getLockEpoch } from "@/lib/lock-epoch";

export type LoginState = { error: string | null };

export async function unlock(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = process.env.SITE_PASSWORD;
  const next = safeNext(String(formData.get("next") ?? "/"));
  if (!password) redirect(next); // no password set (only allowed while developing)

  const given = String(formData.get("password") ?? "");
  if (!sameText(given, password)) {
    await new Promise((r) => setTimeout(r, 1000)); // slows down guessing
    return { error: "Wrong password." };
  }

  // Stays unlocked on this browser for a week, renewed every visit (src/lib/auth.ts).
  (await cookies()).set(AUTH_COOKIE, await fingerprint(password, await getLockEpoch()), cookieOptions);
  redirect(next);
}

export async function lock() {
  (await cookies()).delete(AUTH_COOKIE);
  redirect("/login");
}

// Sign out every other browser and phone (this one stays unlocked). Asks for the password first.
export async function lockOtherDevices(given: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const password = process.env.SITE_PASSWORD;
  if (!password) return { ok: false, message: "No site password is set." };
  if (!sameText(given, password)) {
    await new Promise((r) => setTimeout(r, 1000)); // slows down guessing
    return { ok: false, message: "Wrong password." };
  }
  try {
    const epoch = await bumpLockEpoch();
    (await cookies()).set(AUTH_COOKIE, await fingerprint(password, epoch), cookieOptions); // keep this one unlocked
    return { ok: true };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
