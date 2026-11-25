import { mbm } from "@/mbm/supabase";
import GoogleCard from "@/mbm/components/GoogleCard";
import { googleStatus, listCalendars } from "@/mbm/google";
import CalendarPicker from "@/mbm/components/CalendarPicker";
import { Card, EmailForm, PasswordForm, SubPage } from "@/mbm/components/AccountView";
import AccountShell from "../shell";

export const metadata = { title: "Sign-in and connections" };

export default function SignInPage() {
  return (
    <AccountShell
      path="/account/sign-in"
      render={async (user) => {
        const client = await mbm();
        const google = await googleStatus(client).catch(() => null);
        const calendars = google?.connected ? await listCalendars(client).catch(() => null) : null;
        return (
          <SubPage mark="sign-in" title="Sign-in and connections" note="How you sign in, and the accounts Minute by Minute reads from.">
            <Card title="Email and password">
              <EmailForm email={user.email ?? null} />
              <div className="my-6 h-px bg-line" />
              <PasswordForm />
            </Card>
            <Card title="Google" note="Sign in with Google, and your Google Calendar.">
              <div className="-m-1 [&>*]:mt-0">
                <GoogleCard status={google} />
              </div>
            </Card>
            {calendars && calendars.length > 0 && (
              <Card title="Calendars" note="Which ones Minute by Minute reads. One that's off doesn't show, suggest, or start jobs.">
                <CalendarPicker calendars={calendars} />
              </Card>
            )}
          </SubPage>
        );
      }}
    />
  );
}
