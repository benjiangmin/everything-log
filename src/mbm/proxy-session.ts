import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isMbmHost } from "./paths";

// Minute by Minute's sign-in lasts an hour at a time and renews itself. Pages can't save the
// renewed sign-in, so the proxy does it on every visit to a page that uses it (otherwise you'd
// get signed out at random).
export const usesMbm = (pathname: string) => pathname === "/" || pathname === "/mbm" || pathname.startsWith("/mbm/");

// rewrite: on Minute by Minute's own domain, the /mbm page that a clean address shows.
export async function withMbmSession(request: NextRequest, rewrite?: URL): Promise<NextResponse> {
  const pass = () => (rewrite ? NextResponse.rewrite(rewrite, { request }) : NextResponse.next({ request }));
  let response = pass();
  const url = process.env.MBM_SUPABASE_URL;
  const key = process.env.MBM_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        for (const { name, value } of list) request.cookies.set(name, value); // this visit sees it
        response = pass();
        for (const { name, value, options } of list) response.cookies.set(name, value, options); // and it's kept
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });
  try {
    const { data } = await client.auth.getClaims(); // renews the sign-in if it's due
    // An account deleted somewhere else (the phone app): its sign-in still reads as good here until
    // it's due to renew, up to an hour. Every couple of minutes, ask Supabase if it's still there;
    // gone means signed out, to the sign-in page. (Supabase unreachable: carry on as before.)
    if (data?.claims?.sub && Date.now() - Number(request.cookies.get("mbm_alive")?.value ?? 0) > 120_000) {
      const { data: u, error } = await client.auth.getUser();
      if (!u.user && error && /does not exist|user_not_found|not found/i.test(`${error.message} ${(error as { code?: string }).code ?? ""}`)) {
        await client.auth.signOut({ scope: "local" });
        const out = NextResponse.redirect(new URL(isMbmHost(request.headers.get("host")) ? "/login?gone=1" : "/mbm/login?gone=1", request.url));
        for (const c of response.cookies.getAll()) out.cookies.set(c);
        for (const c of request.cookies.getAll()) if (c.name.startsWith("sb-")) out.cookies.delete(c.name);
        return out;
      }
      if (u.user) response.cookies.set("mbm_alive", String(Date.now()), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 3600 });
    }
  } catch {
    // Supabase unreachable: the page shows its own message.
  }
  return response;
}
