import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { mbmUser } from "@/mbm/supabase";
import WelcomeFlow from "./WelcomeFlow";

export const metadata = { title: "Welcome · Minute by Minute" };

// Making an account: welcome, why, what it does, then the account (WelcomeFlow). Signed in
// already: Home, unless ?replay=1 (to look through it again, from Your account).
export default function WelcomePage(props: PageProps<"/mbm/welcome">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      {props.searchParams.then((p) => (
        <Welcome replay={p.replay === "1"} google={typeof p.google === "string" ? p.google : null} />
      ))}
    </Suspense>
  );
}

async function Welcome({ replay, google }: { replay: boolean; google: string | null }) {
  await connection();
  if (!replay && (await mbmUser().catch(() => null))) redirect("/");
  return <WelcomeFlow google={google} />;
}
