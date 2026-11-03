// A Pokémon pinned to a corner (or the bottom middle) of an app's black-bordered box: behind
// everything in the box, trimmed by its border, and it stays put while the list scrolls.
//
// The box needs: relative + overflow-hidden + isolate (isolate keeps the mascot behind the box's
// contents without slipping behind the page).
//
// Tweak one with `className` (Tailwind wins over the defaults below), e.g.
//   w-40 sm:w-52        size
//   -bottom-6 -left-8   position (negative = pushed past the edge)
//   opacity-50          fade
//   rotate-6            tilt
//   -scale-x-100        face the other way

const SPOT = {
  left: "-bottom-4 -left-6 rotate-3",
  right: "-bottom-4 -right-6 -rotate-3",
  center: "-bottom-4 left-1/2 -translate-x-1/2",
} as const;

export default function Mascot({
  name,
  corner,
  className = "",
}: {
  name: string; // the file in /public, without .png
  corner: keyof typeof SPOT;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- decorative
    <img
      src={`/${name}.png`}
      alt=""
      aria-hidden="true"
      decoding="async"
      className={`pointer-events-none absolute -z-10 w-32 select-none opacity-60 sm:w-40 ${SPOT[corner]} ${className}`}
    />
  );
}
