import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getDay, mbmTz } from "@/mbm/data";
import { mbm, mbmReady, mbmUser } from "@/mbm/supabase";
import { dayKeyOf, dayTitle, isDayKey, shiftDay } from "@/mbm/time";
import Reflect from "@/mbm/components/Reflect";
import Loading from "@/mbm/components/Loading";
import NoPhoneHint from "@/mbm/components/NoPhoneHint";

export const metadata = { title: "Reflect" };

// Reflect: a walk back through a day (today, in the evening; ?day=YYYY-MM-DD for another).
export default function MbmReflectPage(props: PageProps<"/mbm/reflect">) {
  return (
    <main className="relative h-[calc(100dvh-4rem)] w-full overflow-hidden">
      <Suspense
        fallback={
          <div className="p-6">
            <Loading tall />
          </div>
        }
      >
        {props.searchParams.then((sp) => (
          <ReflectFor day={typeof sp.day === "string" ? sp.day : undefined} />
        ))}
      </Suspense>
    </main>
  );
}

async function ReflectFor({ day: asked }: { day?: string }) {
  await connection();
  if (!mbmReady()) return <p className="m-6 rounded-card bg-surface px-5 py-4 text-sm">Minute by Minute isn&apos;t connected yet.</p>;
  const user = await mbmUser();
  if (!user) redirect(`/mbm/login?next=${encodeURIComponent(asked ? `/mbm/reflect?day=${asked}` : "/mbm/reflect")}`);
  const tz = mbmTz();
  const today = dayKeyOf(new Date(), tz);
  const dayKey = isDayKey(asked) && asked <= today ? asked : today;
  const [day, name] = await Promise.all([
    getDay(dayKey).catch((e: Error) => e),
    (async () => {
      const { data } = await (await mbm()).from("profiles").select("name").maybeSingle();
      return (data?.name as string | null | undefined)?.split(" ")[0] ?? null;
    })().catch(() => null),
  ]);
  if (day instanceof Error) return <p className="m-6 rounded-card bg-surface px-5 py-4 text-sm text-danger">{day.message}</p>;
  return (
    <>
    <div className="absolute inset-x-0 top-3 z-40 flex justify-center px-4">
      <NoPhoneHint what="The places and routes Reflect walks through" />
    </div>
    <Reflect
      key={dayKey}
      day={day}
      today={dayKey === today}
      title={dayTitle(dayKey)}
      name={name}
      prev={shiftDay(dayKey, -1)}
      next={dayKey < today ? shiftDay(dayKey, 1) : null}
    />
    </>
  );
}
