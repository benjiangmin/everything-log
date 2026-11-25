import { phoneClient } from "@/mbm/phoneAuth";
import { keepGoing } from "@/mbm/smart";

// For the phone: "Keep going" on a "running a while" notification (AI suggestions, 081).
//   POST /mbm/api/keep-going  Authorization: Bearer <access token>   { "block_id": "…" }
export async function POST(req: Request) {
  const auth = await phoneClient(req);
  if (auth.error) return auth.error;
  const id = (auth.body as { block_id?: unknown }).block_id;
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Which one?" }, { status: 400 });
  await keepGoing(auth.client, id);
  return Response.json({ ok: true });
}
