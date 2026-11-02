import "server-only";
import { db } from "./supabase";
import { TIME_ZONE } from "./month";
import { parseEmail, type InboundEmail } from "./inbox-parse";

// The budget's review list: purchases read from alert emails (see inbox-parse.ts).

export type InboxItem = {
  id: string;
  source: string | null; // null = couldn't read it
  amount: number | null;
  merchant: string | null;
  note: string | null;
  spent_on: string | null;
  from_addr: string | null;
  subject: string | null;
  body_text: string | null;
  received_at: string;
};

// Save one received email (reads it first). The same email twice is ignored.
export async function storeInboundEmail(emailId: string, email: InboundEmail): Promise<void> {
  const parsed = parseEmail(email, TIME_ZONE);
  const row = {
    email_id: emailId,
    from_addr: email.from.slice(0, 300),
    subject: email.subject.slice(0, 500),
    body_text: email.text.slice(0, 20000),
    received_at: email.receivedAt.toISOString(),
    ...(parsed.kind === "purchase"
      ? {
          status: "pending",
          source: parsed.source,
          amount: parsed.amount,
          merchant: parsed.merchant.slice(0, 200),
          note: parsed.note,
          spent_on: parsed.date,
        }
      : parsed.kind === "skip"
        ? { status: "skipped", source: parsed.source, reason: parsed.reason }
        : { status: "pending" }),
  };
  const { error } = await db().from("budget_inbox").upsert(row, { onConflict: "email_id", ignoreDuplicates: true });
  if (error) throw new Error(`Couldn't save the email: ${error.message}`);
}

export async function countPendingInbox(): Promise<number> {
  const { count, error } = await db().from("budget_inbox").select("id", { count: "exact", head: true }).eq("status", "pending");
  if (error) throw new Error(`Couldn't check for new purchases: ${error.message}`);
  return count ?? 0;
}

export async function getPendingInbox(): Promise<InboxItem[]> {
  const { data, error } = await db()
    .from("budget_inbox")
    .select("id, source, amount, merchant, note, spent_on, from_addr, subject, body_text, received_at")
    .eq("status", "pending")
    .order("received_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Couldn't load new purchases: ${error.message}`);
  // Read each waiting email again with today's readers, so a fix (or a new reader) also
  // applies to ones that came in before it. Nothing is saved until you Add.
  return data.map((d) => {
    const item = { ...d, amount: d.amount === null ? null : Number(d.amount) };
    const parsed = parseEmail(
      { from: d.from_addr ?? "", subject: d.subject ?? "", text: d.body_text ?? "", receivedAt: new Date(d.received_at) },
      TIME_ZONE,
    );
    return parsed.kind === "purchase"
      ? { ...item, source: parsed.source, amount: parsed.amount, merchant: parsed.merchant, note: parsed.note, spent_on: parsed.date }
      : item;
  });
}
