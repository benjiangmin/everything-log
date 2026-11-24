import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, cookieOptions, fingerprint, sameText } from "@/lib/auth";
import { getLockEpoch } from "@/lib/lock-epoch";
import { usesMbm, withMbmSession } from "@/mbm/proxy-session";
import { MBM_ORIGIN, clean, isMbmHost } from "@/mbm/paths";

// Runs before every request. No valid unlock cookie → you get sent to /login.
// This covers pages, saving (server actions), and the search APIs.
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Minute by Minute's own domain (src/mbm/paths.ts): clean addresses for its pages, its own
  // sign-in, never the everything-log's password, and none of the everything-log's pages.
  if (isMbmHost(request.headers.get("host"))) {
    if (pathname.startsWith("/mbm/api/")) return NextResponse.next(); // (the phone app)
    if (pathname === "/mbm" || pathname.startsWith("/mbm/")) {
      const to = request.nextUrl.clone();
      to.pathname = clean(pathname);
      return NextResponse.redirect(to, 308);
    }
    const to = request.nextUrl.clone();
    to.pathname = pathname === "/" ? "/mbm" : `/mbm${pathname}`;
    if (pathname.startsWith("/api/")) return NextResponse.rewrite(to);
    // (Files in public/, like /apple-touch-icon.png: as they are.)
    if (/\.[a-z0-9]+$/i.test(pathname)) return NextResponse.next();
    return withMbmSession(request, to);
  }
  // The old address: on to the new one. Not the phone's API (apps not updated yet), Google's
  // sign-in return (one already under way), or the sign-in the everything-log home links to.
  if (
    process.env.NODE_ENV === "production" &&
    (pathname === "/mbm" || pathname.startsWith("/mbm/")) &&
    !pathname.startsWith("/mbm/api/") &&
    !pathname.startsWith("/mbm/google/") &&
    !(pathname === "/mbm/login" && request.nextUrl.searchParams.get("next") === "/")
  ) {
    return NextResponse.redirect(`${MBM_ORIGIN}${clean(pathname)}${search}`, 308);
  }

  // The login page, and the address Resend delivers emails to (it checks its own signature).
  if (pathname === "/login" || pathname === "/api/inbound-email") return NextResponse.next();
  // Minute by Minute's phone API: the phone signs in with its own Minute by Minute session (the
  // route checks it), never with the everything-log's password.
  if (pathname.startsWith("/mbm/api/")) return NextResponse.next();
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
