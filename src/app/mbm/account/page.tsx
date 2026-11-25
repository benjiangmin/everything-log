import { mbm } from "@/mbm/supabase";
import type { Profile } from "@/mbm/life";
import AccountView from "@/mbm/components/AccountView";
import AccountShell from "./shell";

export const metadata = { title: "Settings" };

// Your account: picture and name, then the list of settings pages.
export default function AccountPage() {
  return (
    <AccountShell
      path="/account"
      render={async (user) => {
        const { data } = await (await mbm()).from("profiles").select("name, avatar").maybeSingle();
        return <AccountView email={user.email ?? null} profile={(data as (Profile & { avatar?: string | null }) | null) ?? null} />;
      }}
    />
  );
}
