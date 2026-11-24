import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import Loading from "@/mbm/components/Loading";
import { mbmReady, mbmUser } from "@/mbm/supabase";
import SocialView from "@/mbm/components/SocialView";
import { loadSocial } from "./actions";

export const metadata = { title: "Social" };

// Social: find people, friends and requests, who you've blocked (SocialView).
export default function SocialPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-10 sm:pt-14">
      <Suspense fallback={<Loading tall />}>
        <Social />
      </Suspense>
    </main>
  );
}

async function Social() {
  await connection();
  if (!mbmReady()) return <p className="rounded-card bg-surface px-5 py-4 text-sm">Minute by Minute isn&apos;t connected yet.</p>;
  if (!(await mbmUser())) redirect("/login?next=/social");
  const res = await loadSocial();
  if (!res.ok) return <p className="rounded-card bg-surface px-5 py-4 text-sm text-danger">{res.message}</p>;
  return <SocialView social={res.social} renderedAt={await loadedAt()} />;
}

async function loadedAt() {
  return Date.now();
}
