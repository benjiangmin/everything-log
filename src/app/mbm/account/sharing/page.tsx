import Link from "next/link";
import ShareSettings from "@/mbm/components/ShareSettings";
import { Card, SubPage } from "@/mbm/components/AccountView";
import { loadSocial } from "../../social/actions";
import { mbmTz } from "@/mbm/data";
import { dayKeyOf } from "@/mbm/time";
import AccountShell from "../shell";

export const metadata = { title: "What others see" };

export default function SharingPage() {
  return (
    <AccountShell
      path="/account/sharing"
      render={async () => {
        const social = await loadSocial();
        const today = dayKeyOf(new Date(), mbmTz());
        const me = social.ok ? social.social.me : null;
        return (
          <SubPage mark="sharing"
            title="What others see"
            note={
              <>
                Your name and picture always show. Private jobs show as Busy, you can set that on the{" "}
                <Link href="/account/jobs" className="underline underline-offset-2 hover:text-ink">
                  Jobs and categories
                </Link>{" "}
                page.
              </>
            }
          >
            <Card>
              {social.ok ? (
                <ShareSettings username={me?.username ?? null} share={me?.share ?? {}} pinned={me ? social.social.pinned : []} today={today} />
              ) : (
                <p className="text-sm text-muted">{social.message}</p>
              )}
            </Card>
          </SubPage>
        );
      }}
    />
  );
}
