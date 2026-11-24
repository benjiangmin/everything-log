import { mbm } from "@/mbm/supabase";
import GoogleCard from "@/mbm/components/GoogleCard";
import { googleStatus } from "@/mbm/google";
import { Card, EmailForm, PasswordForm, SubPage } from "@/mbm/components/AccountView";
import AccountShell from "../shell";

export const metadata = { title: "Sign-in and connections" };

export default function SignInPage() {
  return (
    <AccountShell
      path="/account/sign-in"
      render={async (user) => {
        const google = await googleStatus(await mbm()).catch(() => null);
        return (
          <SubPage title="Sign-in and connections" note="How you sign in, and the accounts Minute by Minute reads from.">
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
          </SubPage>
        );
      }}
    />
  );
}
