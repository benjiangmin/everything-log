import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, cookieOptions, fingerprint, sameText } from "@/lib/auth";
import { getLockEpoch } from "@/lib/lock-epoch";

// Runs before every request. No valid unlock cookie → you get sent to /login.
// This covers pages, saving (server actions), and the search APIs.
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/login") return NextResponse.next();

  const password = process.env.SITE_PASSWORD;
  if (!password) {
    // Not set: fine while developing on your computer, but never leave a live site open.
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("This site is locked: SITE_PASSWORD isn't set on the server.", { status: 503 });
  }

  const cookie = request.cookies.get(AUTH_COOKIE)?.value;
  if (cookie && sameText(cookie, await fingerprint(password, await getLockEpoch()))) {
    // Unlocked: start the week over, so it only locks after a week of not using the site.
    const res = NextResponse.next();
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
