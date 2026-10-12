import { NextResponse } from "next/server";
import { createSessionToken } from "@/lib/auth/session";
import { getSession } from "@/lib/auth/current-account";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { query, queryOne, withTransaction } from "@/lib/db";

// scrypt comes from node:crypto, so this route cannot run on the Edge runtime.
export const runtime = "nodejs";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function back(request: Request, error: string) {
  const url = new URL("/setup", request.url);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: Request) {
  // Middleware only lets a holder of a valid session reach this route, and
  // redirects away anyone who has already claimed their account. Re-check
  // here rather than trusting that, since this route sets a password.
  const session = await getSession();
  if (!session) return back(request, "session");
  if (!session.legacy) {
    return NextResponse.redirect(new URL("/dashboard", request.url), { status: 303 });
  }

  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!EMAIL_RE.test(email)) return back(request, "email");
  if (password.length < MIN_PASSWORD_LENGTH) return back(request, "short");
  if (password !== confirm) return back(request, "mismatch");

  // Same guard as the page: a pre-accounts cookie cannot overwrite a password
  // that has already been set.
  const self = await queryOne<{ claimed: boolean }>(
    "select password_hash is not null as claimed from accounts where id = $1",
    [session.accountId],
  );
  if (self?.claimed) {
    return NextResponse.redirect(new URL("/api/logout", request.url), { status: 303 });
  }

  const clash = await queryOne<{ id: number }>(
    "select id from accounts where lower(email) = $1 and id <> $2",
    [email, session.accountId],
  );
  if (clash) return back(request, "taken");

  const passwordHash = await hashPassword(password);

  await withTransaction(async (client) => {
    await client.query(
      `update accounts
          set email = $1,
              password_hash = $2,
              email_verified_at = coalesce(email_verified_at, now()),
              updated_at = now()
        where id = $3`,
      [email, passwordHash, session.accountId],
    );
    await client.query(
      `insert into profile (account_id)
       select $1 where not exists (select 1 from profile where account_id = $1)`,
      [session.accountId],
    );
  });

  // Swap the anonymous pre-accounts cookie for one that names this account.
  const token = await createSessionToken(session.accountId);
  const response = NextResponse.redirect(new URL("/dashboard", request.url), { status: 303 });
  response.cookies.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

/** Used by the setup page to show what this account already owns. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "no session" }, { status: 401 });
  const rows = await query<{ posts: number; scripts: number; boards: number }>(
    `select (select count(*) from posts   where account_id = $1) as posts,
            (select count(*) from scripts where account_id = $1) as scripts,
            (select count(*) from boards  where account_id = $1) as boards`,
    [session.accountId],
  );
  return NextResponse.json(rows[0] ?? { posts: 0, scripts: 0, boards: 0 });
}
