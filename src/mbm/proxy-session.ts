import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Minute by Minute's sign-in lasts an hour at a time and renews itself. Pages can't save the
// renewed sign-in, so the proxy does it on every visit to a page that uses it (otherwise you'd
// get signed out at random).
export const usesMbm = (pathname: string) => pathname === "/" || pathname === "/mbm" || pathname.startsWith("/mbm/");

export async function withMbmSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const url = process.env.MBM_SUPABASE_URL;
  const key = process.env.MBM_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        for (const { name, value } of list) request.cookies.set(name, value); // this visit sees it
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options); // and it's kept
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });
  try {
    await client.auth.getClaims(); // renews the sign-in if it's due
  } catch {
    // Supabase unreachable: the page shows its own message.
  }
  return response;
}
