import { Suspense, type ReactNode } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import Loading from "@/mbm/components/Loading";
import { mbmReady, mbmUser } from "@/mbm/supabase";

type User = NonNullable<Awaited<ReturnType<typeof mbmUser>>>;

// Every settings page: the page frame, signed in first (back here after), then what it shows.
export default function AccountShell({ path, render }: { path: string; render: (user: User) => Promise<ReactNode> }) {
  return (
    // (Clipped sideways: a page's big drawing reaches out past the column, never off the screen.)
    <div className="w-full overflow-x-clip">
      <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-10 sm:pt-14">
        <Suspense fallback={<Loading tall />}>
          <Inner path={path} render={render} />
        </Suspense>
      </main>
    </div>
  );
}

async function Inner({ path, render }: { path: string; render: (user: User) => Promise<ReactNode> }) {
  await connection();
  if (!mbmReady()) return <p className="rounded-card bg-surface px-5 py-4 text-sm">Minute by Minute isn&apos;t connected yet.</p>;
  const user = await mbmUser();
  if (!user) redirect(`/login?next=${path}`);
  return render(user);
}
