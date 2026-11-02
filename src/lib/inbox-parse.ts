// Reads bank / Venmo alert emails into purchases for the budget's review list.
// No database or server code in here, so it's easy to test and easy to fix when a bank
// changes its wording (every email is saved whole, so old ones can be read again).
//
// To support a new kind of email: add a reader to READERS below.

export type Parsed =
  | { kind: "purchase"; source: string; amount: number; merchant: string; note: string | null; date: string }
  | { kind: "skip"; source: string; reason: string } // recognised, but not spending (statements, requests…)
  | { kind: "unknown" }; // couldn't read it: it shows up for review with the email attached

export type InboundEmail = {
  from: string;
  subject: string;
  text: string; // plain text (from the email's text part, or its HTML turned into text)
  receivedAt: Date;
};

type Reader = (email: InboundEmail, timeZone: string) => Parsed | null; // null = not mine

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const money = (s: string) => Math.round(Number(s.replace(/,/g, "")) * 100) / 100;
const pad = (n: number) => String(n).padStart(2, "0");
const fromIs = (from: string, ...domains: string[]) =>
  domains.some((d) => new RegExp(`@([\\w-]+\\.)*${d.replace(".", "\\.")}>?\\s*$`, "i").test(from.trim()));

// "Nov. 1, 2026" / "November 1, 2026" / "Sept. 3, 2026" → "2026-11-01"
function readDate(s: string): string | null {
  const m = s.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase().slice(0, 4)] ?? MONTHS[m[1].toLowerCase().slice(0, 3)];
  if (!month) return null;
  return `${m[3]}-${pad(month)}-${pad(Number(m[2]))}`;
}

// The day the email arrived, in your time zone.
function dayOf(d: Date, timeZone: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${pad(Number(p.month))}-${pad(Number(p.day))}`;
}

// ---- Discover by Capital One -------------------------------------------------------------
// "…on Nov. 1, 2026, at ANTHROPIC* CLAUDE SUB, a pending authorization or purchase in the
//  amount of $20.00 was placed or charged on your Discover it Chrome Card."
const discover: Reader = (email, timeZone) => {
  if (!fromIs(email.from, "capitalone.com", "discover.com")) return null;
  const source = "Discover";
  const m = email.text.match(
    /on\s+([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}),?\s+at\s+(.+?),\s+a\s+pending\s+authorization\s+or\s+purchase\s+in\s+the\s+amount\s+of\s+\$\s?([\d,]+(?:\.\d{2})?)/i,
  );
  if (!m) {
    // Statements, payment reminders, AutoPay notices…: not purchases.
    if (/statement|payment|autopay|due/i.test(email.subject)) return { kind: "skip", source, reason: "Not a purchase" };
    return { kind: "unknown" };
  }
  const merchant = m[2].trim();
  // Card-funded Venmo payments also send a Venmo email (with better details): count that one.
  if (/venmo/i.test(merchant)) return { kind: "skip", source, reason: "Venmo (counted from Venmo's email)" };
  return {
    kind: "purchase",
    source,
    amount: money(m[3]),
    merchant,
    note: null,
    date: readDate(m[1]) ?? dayOf(email.receivedAt, timeZone),
  };
};

// ---- Venmo ----------------------------------------------------------------------------------
// Subject: "You paid Noah Li $11.00". Requests ("Kristy Her requests $25.00") and money coming
// in ("… paid you $…") are skipped: only money going out counts.
const venmo: Reader = (email, timeZone) => {
  if (!fromIs(email.from, "venmo.com")) return null;
  const source = "Venmo";
  const m = email.subject.trim().match(/^You paid (.+?) \$\s?([\d,]+(?:\.\d{2})?)\s*$/i);
  if (!m) return { kind: "skip", source, reason: "Not a payment you made" };
  const name = m[1].trim();
  return {
    kind: "purchase",
    source,
    amount: money(m[2]),
    merchant: name,
    note: venmoMemo(email.text, name),
    date: dayOf(email.receivedAt, timeZone),
  };
};

// The note written on the payment: the text between the amount and "See transaction".
// The email can say "You paid Leo Wang" more than once (e.g. hidden preview text up top), so
// every copy is tried: first the ones that end at the "See transaction" button (the real card),
// then any that look like a note.
function venmoMemo(text: string, name: string): string | null {
  const flat = text.replace(/\s+/g, " ");
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = flat.split(new RegExp(`You paid ${escaped}`, "i")).slice(1);
  const amount = String.raw`^\s*\$\s?[\d,]+(?:\s?\.?\s?\d{2})?\s*`;
  const strict = new RegExp(`${amount}(.*?)\\s*See transaction`, "i");
  const loose = new RegExp(`${amount}(.*?)\\s*(?:See transaction|Transaction details|View in Venmo|Payment ID|$)`, "i");
  for (const pattern of [strict, loose]) {
    for (const part of parts) {
      const memo = part.match(pattern)?.[1]?.trim();
      if (memo && !/^You paid\b/i.test(memo)) return memo.slice(0, 100);
    }
  }
  return null;
}

const READERS: Reader[] = [discover, venmo];

export function parseEmail(email: InboundEmail, timeZone = "America/Chicago"): Parsed {
  for (const read of READERS) {
    const result = read(email, timeZone);
    if (result) return result;
  }
  return { kind: "unknown" };
}

// Turns an email's HTML into readable text (good enough for alert emails).
export function emailHtmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|td|li|h\d|table)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;|&rsquo;|&#8217;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}
