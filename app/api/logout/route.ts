import { NextResponse } from "next/server";

/**
 * Clear the session cookie and send the visitor to the login page.
 *
 * Also used to discard a stale pre-accounts cookie once the owner account has
 * already been claimed, so that cookie cannot be used to reach the setup
 * screen and overwrite a password that is already set.
 */
function clear(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  response.cookies.set("session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: Request) {
  return clear(request);
}

export async function POST(request: Request) {
  return clear(request);
}
