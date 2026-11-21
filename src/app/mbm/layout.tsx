import { Suspense } from "react";
import { mbm, mbmUser } from "@/mbm/supabase";
import { isEverythingLogOwner } from "@/mbm/owner";
import MbmTopBar from "@/mbm/components/MbmTopBar";
import MbmPanels from "@/mbm/components/MbmPanels";
import LiveRefresh from "@/mbm/components/LiveRefresh";

export const metadata = { title: { default: "Minute by Minute", template: "%s · Minute by Minute" } };

// Minute by Minute's own frame: its top bar (Home · Day · Stats) and its side panels. Nothing
// from the everything-log, apart from a small link back that only you see.
export default function MbmLayout({ children }: LayoutProps<"/mbm">) {
  return (
    <>
      <Suspense fallback={<div className="h-16" />}>
        <Bar />
      </Suspense>
      <MbmPanels />
      {/* What the phone sends shows up within 30 seconds. */}
      <LiveRefresh />
      {children}
    </>
  );
}

async function Bar() {
  const [user, owner] = await Promise.all([mbmUser(), isEverythingLogOwner()]);
  // Your name and picture, for the profile button (040; before it's run, just your initial).
  let me: { name: string | null; avatar: string | null } | null = null;
  let phone: { name: string | null; last_seen: string } | null = null; // (the linked phone, 036)
  if (user) {
    const client = await mbm();
    const r = await client.from("profiles").select("name, avatar").maybeSingle();
    const r2 = r.error ? await client.from("profiles").select("name").maybeSingle() : r;
    me = { name: (r2.data as { name?: string | null } | null)?.name ?? null, avatar: (r2.data as { avatar?: string | null } | null)?.avatar ?? null };
    const ph = await client.from("phones").select("name, last_seen").maybeSingle();
    if (!ph.error) phone = ph.data as typeof phone;
  }
  return <MbmTopBar signedIn={Boolean(user)} email={user?.email ?? null} owner={owner} me={me} phone={phone} now={await loadedAt()} />;
}

// (When this was loaded, for "seen 5 min ago": read here rather than while drawing.)
async function loadedAt() {
  return Date.now();
}
