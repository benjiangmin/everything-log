import { Card, ReflectTime, SetupLinks, SubPage } from "@/mbm/components/AccountView";
import AccountShell from "../shell";

export const metadata = { title: "Reflect and setup" };

export default function ReflectPage() {
  return (
    <AccountShell
      path="/account/reflect"
      render={async () => (
        <SubPage mark="reflect" title="Reflect and setup">
          <Card title="Reflect" note="The Reflect tab walks you back through today. It opens in the evening, at this time (on this browser).">
            <ReflectTime />
          </Card>
          <Card title="Setup" note="Go through the welcome and setup again, to change your answers or see what a new account sees.">
            <SetupLinks />
          </Card>
        </SubPage>
      )}
    />
  );
}
