import { searchFocus } from "@/lib/focus";
import { MIN_SEARCH_LENGTH } from "@/lib/search-config";

// GET /api/focus/search?record=<id>&q=unity  →  { results: [...], total: 12 }
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 60);
  if (q.length < MIN_SEARCH_LENGTH) return Response.json({ results: [], total: 0 });
  try {
    return Response.json(await searchFocus(params.get("record") ?? "", q));
  } catch (e) {
    return Response.json({ results: [], error: (e as Error).message }, { status: 500 });
  }
}
