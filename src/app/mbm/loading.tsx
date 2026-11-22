import Loading from "@/mbm/components/Loading";

// Shown the moment you switch tabs, until the page is ready.
export default function MbmLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:pt-8">
      <Loading tall />
    </main>
  );
}
