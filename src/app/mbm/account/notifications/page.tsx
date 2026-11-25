import { Card, SubPage } from "@/mbm/components/AccountView";
import AiSwitch, { UntrackedAfter } from "@/mbm/components/AiSwitch";
import { aiReady } from "@/mbm/ai";
import { mbm } from "@/mbm/supabase";
import AccountShell from "../shell";

export const metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <AccountShell
      path="/account/notifications"
      render={async () => {
        const { data, error } = await (await mbm()).from("profiles").select("ai_suggestions").maybeSingle();
        const on = !error && !!(data as { ai_suggestions?: boolean } | null)?.ai_suggestions;
        const afterRes = await (await mbm()).from("profiles").select("untracked_after_min").maybeSingle();
        const after = (afterRes.data as { untracked_after_min?: number | null } | null)?.untracked_after_min ?? null;
        return (
          <SubPage mark="notifications" title="Notifications" note="Suggestions, and the nudges you get on the phone and here.">
            <Card
              title="AI suggestions"
              note="AI looks at where you are, the time, your calendar and your past days, and leaves out suggestions that don't fit. It also tells you when something's been going a while and it looks like you forgot to stop it."
            >
              <AiSwitch on={on} needsSql={!!error} ready={aiReady()} />
            </Card>
            <Card title="When you're untracked" note="Your phone asks what you're doing once nothing's been running this long. Quiet hours on the phone still apply.">
              <UntrackedAfter value={after} needsSql={!!afterRes.error} />
            </Card>
          </SubPage>
        );
      }}
    />
  );
}
