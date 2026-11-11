import { mbm } from "@/mbm/supabase";

// Every "Route looks wrong" report you've made, as one file to download (and send to Claude, so
// routes can be tested against them). Signed in only: each person gets just their own.
export async function GET() {
  const client = await mbm();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { data, error } = await client.from("route_reports").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) return Response.json({ error: /route_reports/.test(error.message) ? "Run supabase/minute-by-minute/029_route_reports.sql first." : error.message }, { status: 500 });
  return new Response(JSON.stringify({ made: new Date().toISOString(), reports: data }, null, 1), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="mbm-route-reports-${new Date().toISOString().slice(0, 10)}.json"` },
  });
}
