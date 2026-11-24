import Link from "next/link";
import { mbm } from "@/mbm/supabase";

// A short note where something needs the phone app and no phone is linked yet (036_phones.sql):
// the Day map, Reflect, Stats. (Home has the bigger card: PhoneNote.)
export default async function NoPhoneHint({ what, className = "" }: { what: string; className?: string }) {
  const { data, error } = await (await mbm()).from("phones").select("name").maybeSingle();
  if (error || data) return null;
  return (
    <p role="status" className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-card border border-line bg-surface px-4 py-2.5 text-sm ${className}`}>
      <span aria-hidden="true">📱</span>
      <span className="text-muted">{what} come from the phone app, and no phone is set up yet.</span>
      <Link href="/setup?step=phone" className="font-semibold text-ink underline underline-offset-2">
        Set it up
      </Link>
    </p>
  );
}
