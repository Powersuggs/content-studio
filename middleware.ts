import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/auth/session";

// /api/login: how you GET a session in the first place.
// /api/sync/cron: authenticated separately, via CRON_SECRET (the platform
//   scheduler doesn't have a browser session/cookie to send).
const PUBLIC_PATHS = ["/login", "/api/login", "/api/sync/cron"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const token = request.cookies.get("session")?.value;
  const valid = await verifySessionToken(token);

  if (!valid) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next's internal static/image assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
