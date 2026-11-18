import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { mbm, mbmReady, mbmUser } from "@/mbm/supabase";
import type { Profile } from "@/mbm/life";
import AccountView from "@/mbm/components/AccountView";

export const metadata = { title: "Your account" };

// Your account: picture and name, About you, email and password, and clearing or deleting it.
export default function AccountPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-10 sm:pt-14">
      <Suspense fallback={<div aria-busy="true" className="h-96 animate-pulse rounded-card bg-line" />}>
        <Account />
      </Suspense>
    </main>
  );
}

async function Account() {
  await connection();
  if (!mbmReady()) return <p className="rounded-card bg-surface px-5 py-4 text-sm">Minute by Minute isn&apos;t connected yet.</p>;
  const user = await mbmUser();
  if (!user) redirect("/mbm/login?next=/mbm/account");
  const client = await mbm();
  // (Newest columns first; older setups fall back to what they have.)
  let res = await client.from("profiles").select("name, birthday, sex, race, state, education, smoking, exercise, avatar, skipped").maybeSingle();
  if (res.error) res = await client.from("profiles").select("name, birthday, sex, race, state, skipped").maybeSingle();
  const profile = (res.data as (Profile & { avatar?: string | null }) | null) ?? null;
  return <AccountView email={user.email} profile={profile} />;
}
