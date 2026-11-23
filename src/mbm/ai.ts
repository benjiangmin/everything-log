import "server-only";

// NOT USED YET: the AI suggestions are on hold (wired back in later: api/context/route.ts and
// bestGuesses in actions.ts call sharpen(); needs OPENAI_API_KEY and 065_job_traits.sql).

// The AI (OpenAI), server-only: OPENAI_API_KEY in the environment (never sent to a browser or the
// phone). Small, rare calls: reading a new job's name once, and which job fits a new place once.
// Without the key, everything works as before (no AI).

const MODEL = "gpt-4o-mini";

export const aiReady = () => !!process.env.OPENAI_API_KEY;

// One question with an answer in a fixed shape (a JSON schema), or null if it didn't work.
export async function ask<T>(system: string, user: string, name: string, schema: object): Promise<T | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
      }),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content;
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}
