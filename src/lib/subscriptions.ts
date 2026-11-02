import "server-only";
import { db } from "./supabase";
import { localNow } from "./month";
import { upcomingCharge, type Cycle } from "./subscription-dates";

export type Subscription = {
  id: string;
  name: string;
  price: number;
  cycle: Cycle;
  next_charge: string | null; // as saved
  upcoming: string | null; // the next charge from today (rolled forward)
  link: string | null;
  note: string | null;
  cancelled: boolean;
};

function todayKey() {
  const d = localNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Active ones: soonest charge first (no date → at the end). Cancelled: most recent first.
export async function getSubscriptions(): Promise<Subscription[]> {
  const { data, error } = await db()
    .from("subscriptions")
    .select("id, name, price, cycle, next_charge, link, note, cancelled_at")
    .order("cancelled_at", { ascending: false, nullsFirst: true })
    .order("name");
  if (error) throw new Error(`Couldn't load subscriptions: ${error.message}`);
  const today = todayKey();
  const subs = data.map((s) => ({
    id: s.id as string,
    name: s.name as string,
    price: Number(s.price),
    cycle: s.cycle as Cycle,
    next_charge: s.next_charge as string | null,
    upcoming: upcomingCharge(s.next_charge, s.cycle as Cycle, today),
    link: s.link as string | null,
    note: s.note as string | null,
    cancelled: s.cancelled_at !== null,
  }));
  const active = subs
    .filter((s) => !s.cancelled)
    .sort((a, b) => (a.upcoming ?? "9999").localeCompare(b.upcoming ?? "9999") || a.name.localeCompare(b.name));
  return [...active, ...subs.filter((s) => s.cancelled)];
}
