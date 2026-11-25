import { Card, Danger, SubPage } from "@/mbm/components/AccountView";
import AccountShell from "../shell";

export const metadata = { title: "Your data" };

export default function DataPage() {
  return (
    <AccountShell
      path="/account/data"
      render={async () => (
        <SubPage mark="data" title="Your data" note="What you've recorded is yours. Clearing it or deleting your account can't be undone.">
          <Card>
            <Danger />
          </Card>
        </SubPage>
      )}
    />
  );
}
