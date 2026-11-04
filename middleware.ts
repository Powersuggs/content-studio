import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/auth/session";

/**
 * The login wall.
 *
 * Everything here needs a signed-in session except the handful of paths
 * below. There is no signup: this app has one owner, and accounts are
 * created by hand if that ever changes.
 */

// These authenticate themselves rather than by cookie, or must be readable
// by someone with no account at all:
//   /api/sync/cron            -- CRON_SECRET
//   /api/instagram/*          -- Meta signs these (signed_request / OAuth state)
//   /privacy, /terms, ...     -- Meta's reviewer opens them cold, and a
//                                policy you must log in to read is not a policy
const PUBLIC_PATHS = [
  "/login",
  "/api/login",
  "/api/sync/cron",
  "/api/instagram/callback",
  "/api/instagram/deauthorize",
  "/api/instagram/data-deletion",
  "/instagram-data-deletion",
  "/privacy",
  "/terms",
  "/data-deletion",
];

// Signing out has to work from any state, including a stale cookie.
const ALWAYS_ALLOWED = ["/api/logout"];

// Signup and the old claim screen are gone. Anyone landing on them gets the
// login page rather than a 404, which is the useful answer.
const RETIRED_PATHS = ["/signup", "/api/signup", "/setup", "/api/setup"];

function matches(pathname: string, paths: string[]): boolean {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (matches(pathname, PUBLIC_PATHS) || matches(pathname, ALWAYS_ALLOWED)) {
    return NextResponse.next();
  }

  if (matches(pathname, RETIRED_PATHS)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const session = await verifySessionToken(request.cookies.get("session")?.value);

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    // Come back to whatever was being opened, so a bookmarked deep link
    // survives signing in.
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next's own static assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
