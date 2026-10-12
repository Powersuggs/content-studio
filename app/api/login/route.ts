import { NextResponse } from "next/server";
import {
  createSessionToken,
  createUnclaimedSessionToken,
  OWNER_ACCOUNT_ID,
} from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { queryOne } from "@/lib/db";

// scrypt comes from node:crypto, so this route cannot run on the Edge runtime.
export const runtime = "nodejs";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, matches the token's own expiry

/**
 * A real hash of a random string nobody knows. Verified against when the
 * email doesn't exist, so a wrong email costs the same time as a wrong
 * password and the form can't be used to discover which emails have
 * accounts. Never matches any password.
 */
const DUMMY_HASH =
  "scrypt$16384$8$1$BxEKJi349MGIjyu77IJLFg==$gTvuyxUEHf5df5d5NmV5EAemPDBvwQMBtsW4zvtcdEU=";

type AccountRow = {
  id: number;
  password_hash: string | null;
  status: string;
};

function redirectToLogin(request: Request, next: string, error: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", error);
  url.searchParams.set("next", next);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const rawNext = String(formData.get("next") ?? "/dashboard");
  // Only allow redirecting within the app -- never to an external URL, even
  // though this value came from our own hidden field.
  const next = rawNext.startsWith("/") ? rawNext : "/dashboard";

  let accountId: number | null = null;
  let unclaimed = false;

  if (email) {
    const account = await queryOne<AccountRow>(
      "select id, password_hash, status from accounts where lower(email) = $1",
      [email],
    );
    const ok = await verifyPassword(password, account?.password_hash ?? DUMMY_HASH);
    if (account && ok) {
      if (account.status !== "active") {
        return redirectToLogin(request, next, "suspended");
      }
      accountId = account.id;
    }
  } else {
    // Pre-accounts fallback. This is what makes the first login after the
    // change possible, and it retires itself: once the owner has set a
    // password of their own, the shared password stops working entirely.
    const shared = process.env.APP_PASSWORD;
    if (shared && password === shared) {
      const owner = await queryOne<AccountRow>(
        "select id, password_hash, status from accounts where id = $1",
        [OWNER_ACCOUNT_ID],
      );
      if (owner && !owner.password_hash) {
        accountId = owner.id;
        unclaimed = true;
      }
    }
  }

  if (accountId === null) {
    return redirectToLogin(request, next, "1");
  }

  // An unclaimed session is authenticated but anonymous, so middleware sends
  // it to /setup rather than into the app.
  const token = unclaimed
    ? await createUnclaimedSessionToken()
    : await createSessionToken(accountId);
  const response = NextResponse.redirect(new URL(next, request.url), { status: 303 });
  response.cookies.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return response;
}
