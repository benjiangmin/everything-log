import { Suspense } from "react";
import Loading from "@/mbm/components/Loading";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { mbm, mbmReady, mbmUser } from "@/mbm/supabase";
import type { Profile } from "@/mbm/life";
import AccountView from "@/mbm/components/AccountView";
import GoogleCard from "@/mbm/components/GoogleCard";
import { googleStatus } from "@/mbm/google";
import ShareSettings from "@/mbm/components/ShareSettings";
import { loadSocial } from "../social/actions";
import { mbmTz } from "@/mbm/data";
import { dayKeyOf } from "@/mbm/time";

export const metadata = { title: "Your account" };

// Your account: picture and name, About you, email and password, and clearing or deleting it.
export default function AccountPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-10 sm:pt-14">
      <Suspense fallback={<Loading tall />}>
        <Account />
      </Suspense>
    </main>
  );
}

async function Account() {
  await connection();
  if (!mbmReady()) return <p className="rounded-card bg-surface px-5 py-4 text-sm">Minute by Minute isn&apos;t connected yet.</p>;
  const user = await mbmUser();
  if (!user) redirect("/login?next=/account");
  const client = await mbm();
  // (Newest columns first; older setups fall back to what they have.)
  let res = await client.from("profiles").select("name, birthday, sex, race, state, education, smoking, exercise, avatar, skipped").maybeSingle();
  if (res.error) res = await client.from("profiles").select("name, birthday, sex, race, state, skipped").maybeSingle();
  const profile = (res.data as (Profile & { avatar?: string | null }) | null) ?? null;
  const google = await googleStatus(client).catch(() => null);
  const social = await loadSocial();
  const share = social.ok && social.social.me ? (
    <ShareSettings username={social.social.me.username} share={social.social.me.share ?? {}} pinned={social.social.pinned} today={dayKeyOf(new Date(), mbmTz())} />
  ) : social.ok ? (
    <ShareSettings username={null} share={{}} pinned={[]} today={dayKeyOf(new Date(), mbmTz())} />
  ) : (
    <p className="text-sm text-muted">{social.message}</p>
  );
  return <AccountView email={user.email} profile={profile} connections={<GoogleCard status={google} />} social={share} />;
}
