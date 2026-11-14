import { NextResponse } from "next/server";
import { createSessionToken } from "@/lib/auth/session";
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

  // Everyone signs in as themselves now. The shared APP_PASSWORD fallback
  // that used to live here is gone: it only ever worked on an owner
  // account with no password of its own, so it had already retired itself,
  // and leaving it in meant a second way in that nobody was watching.
  let accountId: number | null = null;

  if (email) {
    const account = await queryOne<AccountRow>(
      "select id, password_hash, status from accounts where lower(email) = $1",
      [email],
    );
    // Verified against a dummy hash when there is no such account, so a
    // wrong email and a wrong password take the same time to fail and the
    // form cannot be used to find out which emails exist.
    const ok = await verifyPassword(password, account?.password_hash ?? DUMMY_HASH);
    if (account && ok) {
      if (account.status !== "active") {
        return redirectToLogin(request, next, "suspended");
      }
      accountId = account.id;
    }
  }

  if (accountId === null) {
    return redirectToLogin(request, next, "1");
  }

  const token = await createSessionToken(accountId);
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
