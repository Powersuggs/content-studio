import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/auth/session";

// /login, /api/login: how you GET a session in the first place.
// /api/sync/cron: authenticated separately, via CRON_SECRET (the platform
//   scheduler doesn't have a browser session/cookie to send).
const PUBLIC_PATHS = ["/login", "/api/login", "/api/sync/cron"];

// Reachable ONLY while holding a pre-accounts session, so the owner can claim
// their account. Everything else redirects there until they have, and anyone
// who has already claimed is sent away from them.
const CLAIM_PATHS = ["/setup", "/api/setup"];

// Reachable with any valid session, claimed or not. Logging out must work in
// both states, including to discard a stale pre-accounts cookie.
const ALWAYS_ALLOWED = ["/api/logout"];

function matches(pathname: string, paths: string[]): boolean {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (matches(pathname, PUBLIC_PATHS)) {
    return NextResponse.next();
  }

  const token = request.cookies.get("session")?.value;
  const session = await verifySessionToken(token);

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (matches(pathname, ALWAYS_ALLOWED)) {
    return NextResponse.next();
  }

  // A pre-accounts cookie proves someone knew the shared password but not who
  // they are. Send them to /setup to put a real login on the owner account.
  // The setup page itself re-checks against the database and bounces this
  // cookie out if the account has in fact already been claimed.
  if (session.legacy && !matches(pathname, CLAIM_PATHS)) {
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  // Once the account is claimed there is nothing to set up.
  if (!session.legacy && matches(pathname, CLAIM_PATHS)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next's internal static/image assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
