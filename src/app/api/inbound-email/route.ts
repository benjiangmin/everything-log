import { createHmac, timingSafeEqual } from "node:crypto";
import { emailHtmlToText } from "@/lib/inbox-parse";
import { storeInboundEmail } from "@/lib/budget-inbox";

// Resend calls this when an email arrives at in.benbadobee.com (Gmail forwards the bank and
// Venmo alerts there). It's the one address on the site that works without the password,
// so it only accepts requests signed with RESEND_WEBHOOK_SECRET.
//
// Needs (server-only, never NEXT_PUBLIC_): RESEND_WEBHOOK_SECRET (whsec_…) and RESEND_API_KEY (re_…).

const TOLERANCE_S = 5 * 60; // reject signatures older than 5 minutes (stops replays)

function verified(body: string, headers: Headers): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature");
  if (!secret || !id || !timestamp || !signatures) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > TOLERANCE_S) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = Buffer.from(createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64"));
  return signatures.split(" ").some((entry) => {
    const given = Buffer.from(entry.split(",")[1] ?? "");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

type Received = { from?: string; subject?: string; text?: string | null; html?: string | null; created_at?: string };

export async function POST(request: Request) {
  const body = await request.text();
  if (!verified(body, request.headers)) return Response.json({ error: "Bad signature" }, { status: 401 });

  const event = JSON.parse(body) as { type?: string; data?: { email_id?: string } };
  const emailId = event.data?.email_id;
  if (event.type !== "email.received" || !emailId) return Response.json({ ok: true, ignored: true });

  // The webhook only says an email came in; fetch the email itself.
  const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY ?? ""}` },
    cache: "no-store",
  });
  if (!res.ok) {
    // A failure here makes Resend try again later.
    return Response.json({ error: `Couldn't fetch the email (${res.status})` }, { status: 502 });
  }
  const email = (await res.json()) as Received;

  await storeInboundEmail(emailId, {
    from: email.from ?? "",
    subject: email.subject ?? "",
    text: email.text?.trim() ? email.text : emailHtmlToText(email.html ?? ""),
    receivedAt: email.created_at ? new Date(email.created_at) : new Date(),
  });
  return Response.json({ ok: true });
}
