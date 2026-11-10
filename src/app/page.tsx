import { Suspense, type ReactNode } from "react";
import { connection } from "next/server";
import { getCategories, getHomeLayout } from "@/lib/home";
import { getAlertCategoryIds, getAlertHrefs } from "@/lib/alerts";
import CategoryGrid from "@/components/home/CategoryGrid";
import HomeGreeting from "@/components/home/HomeGreeting";
import HomeMbm from "@/mbm/components/HomeMbm";
import TodoBox from "@/components/home/TodoBox";
import { getTodos } from "@/lib/todos";

// Home: a greeting and the clock, the Home bar (sticks to the top), Minute by Minute, your todo
// list (sticks under the Home bar), then your categories. The layout lives in Supabase (supabase/home.sql), and you change it
// from the page itself with the Edit button.
export default function Home() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 pt-8 sm:pt-14">
      <HomeGreeting />
      <Suspense fallback={<Skeleton />}>
        <Categories>
          {/* Minute by Minute (its own app, see src/mbm): what you're doing now + today's bar. */}
          <Suspense fallback={<div className="mt-6 h-40 animate-pulse rounded-card border-2 border-ink/15" />}>
            <HomeMbm />
          </Suspense>
          {/* The todo list: sticks under the Home bar. */}
          <Suspense fallback={<div className="mt-6 h-28 animate-pulse rounded-card border-2 border-ink/15" />}>
            <Todos />
          </Suspense>
        </Categories>
      </Suspense>
    </main>
  );
}

async function Categories({ children }: { children: ReactNode }) {
  await connection(); // always fresh, never a cached copy
  const [categories, layout, alerts] = await Promise.all([
    getCategories(),
    getHomeLayout(),
    getAlertHrefs().then(getAlertCategoryIds).catch(() => []),
  ]);
  return (
    <CategoryGrid categories={categories} sections={layout.sections} description={layout.description} alerts={alerts}>
      {children}
    </CategoryGrid>
  );
}

async function Todos() {
  await connection();
  return <TodoBox initial={await getTodos().catch(() => "missing" as const)} />;
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="h-16 w-full rounded-card bg-line" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-card bg-line" />
        ))}
      </div>
    </div>
  );
}
