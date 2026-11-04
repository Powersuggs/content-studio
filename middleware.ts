import { NextResponse, type NextRequest } from "next/server";
import {
  createSessionToken,
  verifySessionToken,
  OWNER_ACCOUNT_ID,
} from "@/lib/auth/session";

// SINGLE-USER MODE: there is no login wall. Anyone who opens the URL is
// treated as the owner account (id 1). If the browser has no valid session
// cookie, one is issued automatically so every query is still scoped to the
// owner account exactly as before.
//
// To bring the login screen back later, restore the previous middleware.ts
// from git history.

// Meta's platform callbacks and the cron route authenticate themselves
// (by signature / CRON_SECRET), so they are left untouched.
const PASSTHROUGH_PATHS = [
  "/api/sync/cron",
  "/api/instagram/callback",
  "/api/instagram/deauthorize",
  "/api/instagram/data-deletion",
  "/instagram-data-deletion",
  "/privacy",
  "/terms",
  "/data-deletion",
];

// Old login/claim screens: nothing to do there anymore, go to the app.
const RETIRED_PATHS = ["/login", "/signup", "/setup"];

function matches(pathname: string, paths: string[]): boolean {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (matches(pathname, PASSTHROUGH_PATHS)) {
    return NextResponse.next();
  }

  if (matches(pathname, RETIRED_PATHS)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const existing = await verifySessionToken(request.cookies.get("session")?.value);

  // Already a normal owner session: nothing to do.
  if (existing && !existing.legacy && existing.accountId === OWNER_ACCOUNT_ID) {
    return NextResponse.next();
  }

  // Missing, expired, or old-style cookie: issue a fresh owner session.
  const token = await createSessionToken(OWNER_ACCOUNT_ID);
  request.cookies.set("session", token);
  const response = NextResponse.next({
    request: { headers: new Headers(request.headers) },
  });
  response.cookies.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
