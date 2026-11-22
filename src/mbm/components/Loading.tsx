// While a tab loads: a soft spinning ring in the middle of a calm block (one look for every tab).
export default function Loading({ tall = false }: { tall?: boolean }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" className={`grid place-items-center rounded-card bg-surface/60 ${tall ? "h-96" : "h-64"}`}>
      <span aria-hidden="true" className="size-8 animate-spin rounded-full border-[3px] border-line border-t-ink motion-reduce:animate-none" />
    </div>
  );
}
