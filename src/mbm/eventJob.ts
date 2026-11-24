// Which job a calendar event belongs to: the same rules as the database's event_job (073), so the
// jobs page can show what each job will pick up. In order:
//   1. the job it's linked to (a job's "On your calendar"),
//   2. the job with exactly its name,
//   3. the one job whose name's words are all in it (CS577 → "CS 577 LEC 01"),
//   else none (starting it would make a new job with its name).

type JobLike = { id: string; name: string; calendar_names?: string[] | null; last_used_at?: string | null };

const SKIP = new Set(["the", "and", "for", "with", "at", "in", "on", "of", "to", "a", "my"]);

// (As the database's name_words: "CS 577" is one word, "cs577".)
export function nameWords(t: string): string[] {
  const joined = t.replace(/([a-z])\s+([0-9])/gi, "$1$2").toLowerCase();
  return [...new Set(joined.split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !SKIP.has(w)))];
}

const norm = (t: string) => t.trim().toLowerCase();

export function eventJobId(title: string, jobs: JobLike[]): string | null {
  const t = norm(title);
  if (!t) return null;
  const linked = jobs
    .filter((j) => (j.calendar_names ?? []).some((n) => norm(n) === t))
    .sort((a, b) => +new Date(b.last_used_at ?? 0) - +new Date(a.last_used_at ?? 0));
  if (linked[0]) return linked[0].id;
  const exact = jobs.find((j) => norm(j.name) === t);
  if (exact) return exact.id;
  const words = new Set(nameWords(title));
  const fits = jobs.filter((j) => {
    const w = nameWords(j.name);
    return w.length > 0 && w.every((x) => words.has(x));
  });
  return fits.length === 1 ? fits[0].id : null;
}

// How alike a job and an event sound (for listing likely events first).
export function overlap(name: string, title: string) {
  const a = nameWords(name);
  const b = new Set(nameWords(title));
  return a.filter((w) => b.has(w) || [...b].some((x) => x.startsWith(w) || w.startsWith(x))).length;
}
