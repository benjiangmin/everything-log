import { Suspense } from "react";
import { connection } from "next/server";
import { DAYS, getPlan, getPlans, type Day } from "@/lib/calisthenics";
import { localNow } from "@/lib/month";
import BackLink from "@/components/ui/BackLink";
import CalisthenicsView from "@/components/calisthenics/CalisthenicsView";

// Calisthenics: the workout plan. Opens on today (plus the every-day blocks), with the other
// days a tab away. ?plan=1 shows an older plan (read-only).
export default function CalisthenicsPage(props: PageProps<"/calisthenics">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-4 pb-10 pt-8 sm:pt-10">
      <BackLink className="mb-4 inline-block self-start text-sm text-muted underline-offset-4 hover:text-ink hover:underline" />
      <Suspense fallback={<Skeleton />}>
        {props.searchParams.then((sp) => (
          <Plan planParam={typeof sp.plan === "string" ? sp.plan : undefined} />
        ))}
      </Suspense>
    </main>
  );
}

async function Plan({ planParam }: { planParam?: string }) {
  await connection(); // always fresh (needs today's day)
  const plans = await getPlans();
  const today: Day = DAYS[(localNow().getDay() + 6) % 7]; // getDay(): 0 = Sunday
  const chosen = plans.find((p) => String(p.number) === planParam) ?? plans[0];
  const plan = chosen ? await getPlan(chosen, chosen.id === plans[0].id) : null;
  return <CalisthenicsView key={plan?.id ?? "none"} plan={plan} plans={plans} today={today} />;
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="h-16 w-full rounded-card bg-line" />
      <div className="mt-4 h-11 w-full rounded-control bg-line" />
      <div className="mt-4 h-96 w-full rounded-card bg-line" />
    </div>
  );
}
