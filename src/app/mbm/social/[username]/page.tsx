import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import Loading from "@/mbm/components/Loading";
import { mbmTz } from "@/mbm/data";
import { mbmReady, mbmUser } from "@/mbm/supabase";
import FriendProfile from "@/mbm/components/FriendProfile";
import { loadProfile } from "../actions";

export const metadata = { title: "Profile" };

// Someone's profile: what they share with you (FriendProfile). ?day=: one of their pinned days.
export default function PersonPage(props: PageProps<"/mbm/social/[username]">) {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 pt-10 sm:pt-14">
      <Suspense fallback={<Loading tall />}>
        {Promise.all([props.params, props.searchParams]).then(([p, sp]) => (
          <Person username={decodeURIComponent(p.username)} day={typeof sp.day === "string" ? sp.day : undefined} />
        ))}
      </Suspense>
    </main>
  );
}

async function Person({ username, day }: { username: string; day?: string }) {
  await connection();
  if (!mbmReady()) return <p className="rounded-card bg-surface px-5 py-4 text-sm">Minute by Minute isn&apos;t connected yet.</p>;
  if (!(await mbmUser())) redirect(`/login?next=${encodeURIComponent(`/social/${username}`)}`);
  const profile = await loadProfile(username, day);
  if (!profile) return <p className="rounded-card bg-surface px-5 py-4 text-sm">There&apos;s nobody called @{username} you can see.</p>;
  return <FriendProfile profile={profile} tz={mbmTz()} renderedAt={await loadedAt()} />;
}

async function loadedAt() {
  return Date.now();
}
