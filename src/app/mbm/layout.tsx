import { Suspense } from "react";
import { mbmUser } from "@/mbm/supabase";
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
  return <MbmTopBar signedIn={Boolean(user)} email={user?.email ?? null} owner={owner} />;
}
