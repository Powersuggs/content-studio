import { NextResponse } from "next/server";
import { createSessionToken } from "@/lib/auth/session";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { claimInvite, releaseInvite, normalizeCode } from "@/lib/auth/invites";
import { queryOne, withTransaction } from "@/lib/db";

// scrypt comes from node:crypto, so this route cannot run on the Edge runtime.
export const runtime = "nodejs";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function back(request: Request, error: string, code: string) {
  const url = new URL("/signup", request.url);
  url.searchParams.set("error", error);
  // Hand the code back so a typo in the password does not cost them the
  // code as well.
  if (code) url.searchParams.set("code", code);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const rawCode = String(formData.get("code") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const code = normalizeCode(rawCode);

  // Cheap checks first, so a bad password never burns a use of the code.
  if (!code) return back(request, "code", "");
  if (!EMAIL_RE.test(email)) return back(request, "email", code);
  if (password.length < MIN_PASSWORD_LENGTH) return back(request, "short", code);
  if (password !== confirm) return back(request, "mismatch", code);

  // scoping-exempt: signup necessarily reads accounts before a session exists.
  const taken = await queryOne<{ id: number }>(
    "select id from accounts where lower(email) = $1",
    [email],
  );
  if (taken) return back(request, "taken", code);

  const claimedInvite = await claimInvite(code);
  if (!claimedInvite) return back(request, "code", "");

  const passwordHash = await hashPassword(password);

  let accountId: number;
  try {
    accountId = await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: number }>(
        `insert into accounts (email, password_hash, email_verified_at, role, invited_with, created_via)
         values ($1, $2, null, 'member', $3, 'invite')
         returning id`,
        [email, passwordHash, code],
      );
      const id = rows[0].id;

      // Declare the new account to the transaction before touching any
      // account-scoped table. `accounts` has row-level security off, so the
      // insert above is fine without this, but `profile` has it ON and its
      // policy compares account_id against app_current_account(). With no
      // session there is nothing to compare against, the check evaluates
      // NULL, and the insert below is rejected. Setting it here is what makes
      // signup possible without weakening the policy for everything else.
      await client.query("select set_config('app.account_id', $1, true)", [
        String(id),
      ]);

      // Every account needs its profile row; the rest of the app assumes one.
      await client.query(
        `insert into profile (account_id)
         select $1 where not exists (select 1 from profile where account_id = $1)`,
        [id],
      );

      return id;
    });
  } catch (err) {
    // The use is already spent at this point. Hand it back rather than
    // leaving someone holding a code that silently no longer works
    // because of a failure on our side.
    await releaseInvite(code).catch(() => undefined);
    console.error("[signup] could not create account:", err);
    return back(request, "failed", code);
  }

  const token = await createSessionToken(accountId);
  const response = NextResponse.redirect(new URL("/dashboard", request.url), {
    status: 303,
  });
  response.cookies.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
