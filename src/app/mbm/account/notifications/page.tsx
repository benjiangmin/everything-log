import { Card, SubPage } from "@/mbm/components/AccountView";
import AiSwitch, { NeverSuggest, UntrackedAfter } from "@/mbm/components/AiSwitch";
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
        const neverRes = await (await mbm()).from("profiles").select("never_suggest").maybeSingle();
        const never = (neverRes.data as { never_suggest?: string[] } | null)?.never_suggest ?? [];
        const jobs = ((await (await mbm()).from("activities").select("id, name, color").order("name")).data ?? []) as { id: string; name: string; color: string }[];
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
            <Card title="Never suggest" note="These jobs never show up in Right now? or in notifications, here or on the phone.">
              <NeverSuggest jobs={jobs} chosen={never} needsSql={!!neverRes.error} />
            </Card>
          </SubPage>
        );
      }}
    />
  );
}
