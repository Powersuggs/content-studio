import { NextResponse } from "next/server";
import { createSessionToken } from "@/lib/auth/session";

export async function POST(request: Request) {
  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const rawNext = String(formData.get("next") ?? "/dashboard");
  // Only allow redirecting within the app -- never to an external URL,
  // even though this value came from our own hidden field.
  const next = rawNext.startsWith("/") ? rawNext : "/dashboard";

  const expected = process.env.APP_PASSWORD;
  if (!expected || password !== expected) {
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "1");
    url.searchParams.set("next", next);
    return NextResponse.redirect(url, { status: 303 });
  }

  const token = await createSessionToken();
  const response = NextResponse.redirect(new URL(next, request.url), { status: 303 });
  response.cookies.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days, matches the token's own expiry
  });
  return response;
}
