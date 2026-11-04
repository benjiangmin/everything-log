import "server-only";
import { db } from "./supabase";
import { localNow } from "./month";
import { cleanDreamHtml } from "./dream-html";

// Letters to self. Three piles, decided by today's date (in your time zone, so a letter arrives
// right at 12:00am on its day):
//   on the way: deliver_on is after today. Hidden: the page never even says how many there are;
//               only your password shows them (the sidebar's sealed-letters button)
//   inbox:      arrived, not read yet (the sidebar's inbox, with the red "!")
//   past:       arrived and read (the box on the page)

export type Letter = {
  id: string;
  subject: string;
  body: string; // safe HTML
  written_on: string | null;
  deliver_on: string;
  opened_at: string | null;
};
export type Envelope = Omit<Letter, "body">; // a sealed letter: no words

const pad = (n: number) => String(n).padStart(2, "0");
export function todayKey() {
  const d = localNow();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const clean = (l: Letter): Letter => ({ ...l, body: cleanDreamHtml(l.body) });

// Past letters (arrived and read), newest first.
export async function getPastLetters(): Promise<Letter[]> {
  const { data, error } = await db()
    .from("letters")
    .select("id, subject, body, written_on, deliver_on, opened_at")
    .lte("deliver_on", todayKey())
    .not("opened_at", "is", null)
    .order("deliver_on", { ascending: false });
  if (error) throw new Error(`Couldn't load letters: ${error.message}`);
  return (data as Letter[]).map(clean);
}

// The inbox: arrived (today counts, from 12:00am) but not read yet. Sealed: no words.
export async function getArrived(): Promise<Envelope[]> {
  const { data, error } = await db()
    .from("letters")
    .select("id, subject, written_on, deliver_on, opened_at")
    .lte("deliver_on", todayKey())
    .is("opened_at", null)
    .order("deliver_on", { ascending: false });
  if (error) throw new Error(`Couldn't load letters: ${error.message}`);
  return data as Envelope[];
}

// The letters still on the way (only after the password checks out; see actions).
export async function getQueued(): Promise<Letter[]> {
  const { data, error } = await db()
    .from("letters")
    .select("id, subject, body, written_on, deliver_on, opened_at")
    .gt("deliver_on", todayKey())
    .order("deliver_on");
  if (error) throw new Error(`Couldn't load letters: ${error.message}`);
  return (data as Letter[]).map(clean);
}

// For the red "!": how many have arrived and are waiting to be opened.
export async function countArrived(): Promise<number> {
  const { count, error } = await db().from("letters").select("id", { count: "exact", head: true }).lte("deliver_on", todayKey()).is("opened_at", null);
  if (error) throw error;
  return count ?? 0;
}
