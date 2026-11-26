import { ownThemes } from "@/mbm/colors";
import { mbm } from "@/mbm/supabase";
import ThemePicker from "@/mbm/components/ThemePicker";
import { Card, SubPage } from "@/mbm/components/AccountView";
import AccountShell from "../../shell";

export const metadata = { title: "Color theme" };

// Settings → Jobs → Color theme: every job and category takes its colors (080).
export default function ColorsPage() {
  return (
    <AccountShell
      path="/account/jobs/colors"
      render={async () => {
        const { data, error } = await (await mbm()).from("profiles").select("color_theme").maybeSingle();
        const ownRes = await (await mbm()).from("profiles").select("custom_themes").maybeSingle();
        const own = ownRes.error ? null : ownThemes((ownRes.data as { custom_themes?: unknown } | null)?.custom_themes);
        return (
          <SubPage mark="colors" back={{ href: "/account/jobs", label: "Jobs" }} title="Color theme" note="Every job and category takes the theme's colors, the busiest first. Colors you pick yourself stay when you switch.">
            <Card>
              {error ? (
                <p className="text-sm text-muted">Run supabase/minute-by-minute/080_color_themes.sql in Supabase first.</p>
              ) : (
                <ThemePicker current={(data as { color_theme: string | null } | null)?.color_theme ?? null} own={own} />
              )}
            </Card>
          </SubPage>
        );
      }}
    />
  );
}
