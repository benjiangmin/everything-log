import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, cookieOptions, fingerprint, sameText } from "@/lib/auth";
import { getLockEpoch } from "@/lib/lock-epoch";
import { usesMbm, withMbmSession } from "@/mbm/proxy-session";

// Runs before every request. No valid unlock cookie → you get sent to /login.
// This covers pages, saving (server actions), and the search APIs.
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // The login page, and the address Resend delivers emails to (it checks its own signature).
  if (pathname === "/login" || pathname === "/api/inbound-email") return NextResponse.next();
  // Minute by Minute is its own app with its own sign-in. Once MBM_PUBLIC=1 is set, other people
  // can use it without the everything-log's password (their data is theirs: row level security).
  if (process.env.MBM_PUBLIC === "1" && (pathname === "/mbm" || pathname.startsWith("/mbm/"))) return withMbmSession(request);

  const password = process.env.SITE_PASSWORD;
  if (!password) {
    // Not set: fine while developing on your computer, but never leave a live site open.
    if (process.env.NODE_ENV !== "production") return usesMbm(pathname) ? withMbmSession(request) : NextResponse.next();
    return new NextResponse("This site is locked: SITE_PASSWORD isn't set on the server.", { status: 503 });
  }

  const cookie = request.cookies.get(AUTH_COOKIE)?.value;
  if (cookie && sameText(cookie, await fingerprint(password, await getLockEpoch()))) {
    // Unlocked: start the week over, so it only locks after a week of not using the site.
    // Minute by Minute's pages: also renew its own sign-in.
    const res = usesMbm(pathname) ? await withMbmSession(request) : NextResponse.next();
    res.cookies.set(AUTH_COOKIE, cookie, cookieOptions);
    return res;
  }

  if (pathname.startsWith("/api/") || (request.method !== "GET" && request.method !== "HEAD")) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

// Everything except Next's own files and the tab icon goes through the lock.
export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.png|favicon.ico).*)"],
};
