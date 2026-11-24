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
          <SubPage
            title="What others see"
            note="Your name and picture always show. Everything else is up to you, and starts as Nobody. Mutuals: people you follow who follow you back. Private jobs show as Busy (Jobs and categories)."
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
