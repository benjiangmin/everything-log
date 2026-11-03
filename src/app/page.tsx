import { Suspense } from "react";
import { connection } from "next/server";
import { getCategories } from "@/lib/home";
import { getAlertCategoryIds, getAlertHrefs } from "@/lib/alerts";
import CategoryGrid from "@/components/home/CategoryGrid";
import HomeGreeting from "@/components/home/HomeGreeting";

// Home: a greeting and the clock, then your categories. The layout lives in Supabase (supabase/home.sql), and you change it
// from the page itself with the Edit button.
export default function Home() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 pt-8 sm:pt-14">
      <HomeGreeting />
      <Suspense fallback={<Skeleton />}>
        <Categories />
      </Suspense>
    </main>
  );
}

async function Categories() {
  await connection(); // always fresh, never a cached copy
  const [categories, alerts] = await Promise.all([
    getCategories(),
    getAlertHrefs().then(getAlertCategoryIds).catch(() => []),
  ]);
  return <CategoryGrid categories={categories} alerts={alerts} />;
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
