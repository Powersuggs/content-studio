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
  // Signing up has to work for someone who has no account yet, which is
  // the entire point of an invite code.
  "/signup",
  "/api/signup",
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

// The old claim screen is gone, along with the shared password it existed
// to retire. Its files are deleted, so these paths are listed here to send
// anyone who still has the link to the login page rather than a 404.
//
// Signup is NOT on this list any more. It was, which meant the Create code
// button in Settings produced codes that could not be redeemed: whoever
// was sent one landed on the login screen with no way to make an account.
const RETIRED_PATHS = ["/setup", "/api/setup"];

function matches(pathname: string, paths: string[]): boolean {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * A path cannot be both open to everyone and retired.
 *
 * PUBLIC_PATHS is checked first, so a path in both lists is silently
 * public and the retirement does nothing. That is not a theoretical
 * tidiness problem: signup sat in the retired list while invite codes
 * were being handed out, and the only symptom was invited people never
 * appearing. Crossing the lists is now a mistake that shows up at once
 * rather than months later.
 */
const CONTRADICTORY = PUBLIC_PATHS.filter((p) => RETIRED_PATHS.includes(p));
if (CONTRADICTORY.length > 0) {
  throw new Error(
    `middleware: ${CONTRADICTORY.join(", ")} is both public and retired. Pick one.`,
  );
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
