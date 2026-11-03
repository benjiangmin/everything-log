import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getCategory } from "@/lib/home";
import { getAlertHrefs } from "@/lib/alerts";
import ItemGrid from "@/components/home/ItemGrid";

// A category's own page (e.g. /c/<id> for "Logs"), listing what's inside it.
export default function CategoryPage({ params }: PageProps<"/c/[id]">) {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 pt-8 sm:pt-14">
      <Suspense fallback={<Skeleton />}>
        {params.then(({ id }) => (
          <Items id={id} />
        ))}
      </Suspense>
    </main>
  );
}

async function Items({ id }: { id: string }) {
  const [data, alerts] = await Promise.all([getCategory(id), getAlertHrefs().catch(() => [])]);
  if (!data) notFound();
  return <ItemGrid category={data.category} sections={data.sections} items={data.items} all={data.all} alerts={alerts} />;
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="mb-4 h-5 w-20 rounded-full bg-line" />
      <div className="h-16 w-full rounded-card bg-line" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-20 rounded-card bg-line" />
        ))}
      </div>
    </div>
  );
}
