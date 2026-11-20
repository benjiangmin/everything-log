import { Suspense } from "react";
import { connection } from "next/server";
import { getCategories, getHomeLayout } from "@/lib/home";
import { getAlertCategoryIds, getAlertHrefs } from "@/lib/alerts";
import CategoryGrid from "@/components/home/CategoryGrid";
import HomeGreeting from "@/components/home/HomeGreeting";
import HomeScreens from "@/components/home/HomeScreens";
import { PageHeader } from "@/components/home/bits";
import HomeMbm from "@/mbm/components/HomeMbm";
import TodoBox from "@/components/home/TodoBox";
import { getTodos } from "@/lib/todos";

// Home: two screens you snap between.
//   Home: a greeting and the clock (on the left, on a wide screen), the Home bar, Minute by
//   Minute, your todo list.
//   Documents: the Documents bar (Edit lives here; it sticks to the top) and your categories.
// The layout lives in Supabase (supabase/home.sql); change it from the page with Edit.
export default function Home() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 lg:max-w-6xl">
      <HomeScreens
        home={
          // Wide screens: the greeting and clock on the left (staying put as you scroll), the rest
          // on the right. Narrow: one column, as before.
          <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-12">
            <div className="lg:sticky lg:top-8 lg:self-start">
              <HomeGreeting />
            </div>
            <div>
              <PageHeader title="Home" />
              {/* Minute by Minute (its own app, see src/mbm): what you're doing now + today's bar. */}
              <Suspense fallback={<div className="mt-6 h-40 animate-pulse rounded-card border-2 border-ink/15" />}>
                <HomeMbm />
              </Suspense>
              <Suspense fallback={<div className="mt-6 h-28 animate-pulse rounded-card border-2 border-ink/15" />}>
                <Todos />
              </Suspense>
            </div>
          </div>
        }
        documents={
          // (Documents stays the width it was.)
          <div className="mx-auto w-full max-w-4xl">
            <Suspense fallback={<Skeleton />}>
              <Categories />
            </Suspense>
          </div>
        }
      />
    </main>
  );
}

async function Categories() {
  await connection(); // always fresh, never a cached copy
  const [categories, layout, alerts] = await Promise.all([
    getCategories(),
    getHomeLayout(),
    getAlertHrefs().then(getAlertCategoryIds).catch(() => []),
  ]);
  return (
    <CategoryGrid categories={categories} sections={layout.sections} description={layout.description} alerts={alerts} />
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
