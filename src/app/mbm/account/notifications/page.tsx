import { Card, SubPage } from "@/mbm/components/AccountView";
import AiSwitch from "@/mbm/components/AiSwitch";
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
        return (
          <SubPage mark="notifications" title="Notifications" note="Suggestions, and the nudges you get on the phone and here.">
            <Card
              title="AI suggestions"
              note="AI looks at where you are, the time, your calendar and your past days, and leaves out suggestions that don't fit. It also tells you when something's been going a while and it looks like you forgot to stop it."
            >
              <AiSwitch on={on} needsSql={!!error} ready={aiReady()} />
              <p className="mt-3 text-xs text-muted">
                When it&apos;s on, your job names, places, calendar events and recent days are sent to OpenAI to decide. They aren&apos;t used to train AI.
              </p>
            </Card>
          </SubPage>
        );
      }}
    />
  );
}
