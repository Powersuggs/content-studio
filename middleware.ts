import { NextResponse, type NextRequest } from "next/server";
import {
  createSessionToken,
  verifySessionToken,
  OWNER_ACCOUNT_ID,
} from "@/lib/auth/session";
import {
  ACCESS_COOKIE,
  ACCESS_COOKIE_MAX_AGE,
  ACCESS_QUERY_PARAM,
  createAccessToken,
  isAccessGateEnabled,
  matchesAccessKey,
  readAccessToken,
  shouldRenewAccess,
} from "@/lib/auth/access-key";

// SINGLE-USER MODE: there is no login. Anyone who gets past the secret-link
// gate below is treated as the owner account (id 1), and a session cookie is
// issued automatically so every query is still scoped to that account.
//
// The gate is not a login either: no form, no password, no account. Holding
// the link is the credential. It exists so the site is not readable by
// anyone who happens to have the URL.

// Meta's platform callbacks and the cron route authenticate themselves (by
// signature / CRON_SECRET), and the policy pages must stay publicly readable
// because Meta's reviewer opens them cold. None of these go behind the gate.
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

/**
 * What someone without the key sees.
 *
 * A plain 404, not a login screen and not "access denied". Both of those
 * confirm there is something here worth coming back for; a 404 says nothing
 * at all.
 */
function notFound(): NextResponse {
  return new NextResponse("Not found", {
    status: 404,
    headers: { "content-type": "text/plain" },
  });
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (matches(pathname, PASSTHROUGH_PATHS)) {
    return NextResponse.next();
  }

  // --- The secret-link gate ------------------------------------------
  // Skipped entirely when ACCESS_KEY is unset, so deploying this cannot
  // lock anyone out before they have set the variable.
  let grantAccessCookie: string | null = null;

  if (isAccessGateEnabled()) {
    const check = await readAccessToken(request.cookies.get(ACCESS_COOKIE)?.value);

    // Slide the expiry forward on use. Without this the cookie would die a
    // year after it was set no matter how much the site was used, and the
    // link would have to be dug out again. With it, using the site at all
    // keeps access alive indefinitely.
    if (check.valid && shouldRenewAccess(check.expiresAt)) {
      grantAccessCookie = await createAccessToken();
    }

    if (!check.valid) {
      if (!matchesAccessKey(searchParams.get(ACCESS_QUERY_PARAM))) {
        return notFound();
      }

      // Correct key: remember this device, then bounce to the same URL
      // without the key in it, so it stops being in the address bar, in
      // any link that gets copied, and in referrer headers.
      grantAccessCookie = await createAccessToken();
      const clean = request.nextUrl.clone();
      clean.searchParams.delete(ACCESS_QUERY_PARAM);
      const redirect = NextResponse.redirect(clean);
      redirect.cookies.set(ACCESS_COOKIE, grantAccessCookie, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: ACCESS_COOKIE_MAX_AGE,
      });
      return redirect;
    }
  }

  if (matches(pathname, RETIRED_PATHS)) {
    return withRenewedAccess(
      NextResponse.redirect(new URL("/dashboard", request.url)),
      grantAccessCookie,
    );
  }

  const existing = await verifySessionToken(request.cookies.get("session")?.value);

  // Already a normal owner session: nothing to do but any pending renewal.
  if (existing && !existing.legacy && existing.accountId === OWNER_ACCOUNT_ID) {
    const response = NextResponse.next();
    return withRenewedAccess(response, grantAccessCookie);
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
  return withRenewedAccess(response, grantAccessCookie);
}

/** Attaches a slid-forward access cookie, when one is due. */
function withRenewedAccess(
  response: NextResponse,
  renewed: string | null,
): NextResponse {
  if (renewed) {
    response.cookies.set(ACCESS_COOKIE, renewed, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ACCESS_COOKIE_MAX_AGE,
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
