// The red "!" on a card's top-right corner: something inside needs your attention.
// (Same look as the one in the sidebar.) The card it sits on needs `relative`.
export default function AlertDot({ label }: { label: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="pointer-events-none absolute -right-1.5 -top-1.5 z-10 grid size-5 place-items-center rounded-full bg-danger text-xs font-bold leading-none text-white ring-[3px] ring-paper"
    >
      !
    </span>
  );
}
