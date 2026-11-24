import { mbm } from "@/mbm/supabase";
import type { Profile } from "@/mbm/life";
import AboutYouForm from "@/mbm/components/AboutYouForm";
import { Card, SubPage } from "@/mbm/components/AccountView";
import AccountShell from "../shell";

export const metadata = { title: "About you" };

export default function AboutPage() {
  return (
    <AccountShell
      path="/account/about"
      render={async () => {
        const client = await mbm();
        // (Newest columns first; older setups fall back to what they have.)
        let res = await client.from("profiles").select("name, birthday, sex, race, state, education, smoking, exercise, skipped").maybeSingle();
        if (res.error) res = await client.from("profiles").select("name, birthday, sex, race, state, skipped").maybeSingle();
        return (
          <SubPage title="About you" note="Used on the Future page, to pick the right life table. All optional.">
            <Card>
              <AboutYouForm profile={(res.data as Profile | null) ?? null} />
            </Card>
          </SubPage>
        );
      }}
    />
  );
}
