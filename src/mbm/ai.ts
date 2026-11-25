import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// The AI (OpenAI), server-only: OPENAI_API_KEY in the environment (never sent to a browser or the
// phone). OPENAI_MODEL picks the model (a small, cheap one by default). Without the key, or with
// AI suggestions off in someone's settings, everything works as before (no AI).

const model = () => process.env.OPENAI_MODEL || "gpt-4o-mini";

export const aiReady = () => !!process.env.OPENAI_API_KEY;

// One question with an answer in a fixed shape (a JSON schema), or null if it didn't work. Each
// call is written down in ai_calls (081), to keep an eye on the cost.
export async function ask<T>(client: SupabaseClient, kind: string, system: string, user: string, schema: object): Promise<T | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: model(),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_schema", json_schema: { name: kind, strict: true, schema } },
      }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("OpenAI", res.status, (await res.text().catch(() => "")).slice(0, 300));
      return null;
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    await client
      .from("ai_calls")
      .insert({ kind, model: model(), tokens_in: body.usage?.prompt_tokens ?? null, tokens_out: body.usage?.completion_tokens ?? null })
      .then(() => null, () => null);
    const text = body.choices?.[0]?.message?.content;
    return text ? (JSON.parse(text) as T) : null;
  } catch (e) {
    console.error("OpenAI", e);
    return null;
  }
}
