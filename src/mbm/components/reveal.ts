// Something just opened (a job's settings, a place): scroll smoothly so it's in the middle of
// the screen. One taller than the screen starts near the top instead (its name stays in view; the
// rest runs past the bottom). Instant for reduced motion.
export function reveal(id: string) {
  requestAnimationFrame(() =>
    setTimeout(() => {
      const el = document.getElementById(id);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const room = window.innerHeight;
      const top = r.height <= room - 140 ? r.top - (room - r.height) / 2 : r.top - 96;
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollBy({ top, behavior: still ? "auto" : "smooth" });
    }, 30),
  );
}
