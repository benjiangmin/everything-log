import { createClient } from "@supabase/supabase-js";

// The phone's sign-in, for /mbm/api/*. The token comes in the Authorization header, and also in
// the JSON body: a redirect on the way (benbadobee.com → www, say) can drop the header, which the
// website then answered with "Sign in first." even right after signing in.
export async function phoneClient(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const header = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const token = header || (typeof body.token === "string" ? body.token : "");
  if (!token) return { error: Response.json({ error: "Sign in first. (The website got no sign-in from the phone.)" }, { status: 401 }) };
  const client = createClient(process.env.MBM_SUPABASE_URL!, process.env.MBM_SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: user, error } = await client.auth.getUser(token);
  if (!user.user) return { error: Response.json({ error: `Sign in first. (The website didn't accept the phone's sign-in: ${error?.message ?? "no user"}.)` }, { status: 401 }) };
  return { client, body };
}
