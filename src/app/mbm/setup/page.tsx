import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { googleStatus } from "@/mbm/google";
import { mbm, mbmReady, mbmUser } from "@/mbm/supabase";
import SetupFlow from "./SetupFlow";

export const metadata = { title: "Set up · Minute by Minute" };

// The setup after making an account (SetupFlow). New accounts land here from Home until About you
// is saved; Your account has "Replay setup" to go through it again.
export default function SetupPage(props: PageProps<"/mbm/setup">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      {props.searchParams.then((p) => (
        <Setup step={typeof p.step === "string" ? p.step : undefined} />
      ))}
    </Suspense>
  );
}

async function Setup({ step }: { step?: string }) {
  await connection();
  if (!mbmReady()) return <p className="m-8 rounded-card bg-surface px-5 py-4 text-sm">Minute by Minute isn&apos;t connected yet.</p>;
  const user = await mbmUser();
  if (!user) redirect("/login?next=/setup");
  const client = await mbm();
  const [profile, google, phone] = await Promise.all([
    client.from("profiles").select("name").maybeSingle(),
    googleStatus(client).catch(() => null),
    client.from("phones").select("name").maybeSingle(),
  ]);
  // Your name: what you saved, or what Google says (to confirm on the first slide).
  const { data: claims } = await client.auth.getClaims();
  const meta = ((claims?.claims as { user_metadata?: unknown } | undefined)?.user_metadata ?? {}) as { full_name?: string; name?: string; given_name?: string };
  const name = (profile.data?.name as string | null | undefined) ?? meta.given_name ?? meta.full_name?.split(" ")[0] ?? meta.name?.split(" ")[0] ?? "";
  const start = step === "calendar" || step === "phone" || step === "done" ? step : "about";
  return <SetupFlow name={name} email={user.email ?? "your account"} calendar={!!google?.connected} phone={!phone.error && !!phone.data} start={start} />;
}
