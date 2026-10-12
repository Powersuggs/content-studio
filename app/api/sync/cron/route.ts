import { NextResponse } from "next/server";
import { runInstagramSync } from "@/lib/ig/sync";
import { runAsAccount } from "@/lib/auth/background-account";
import { query } from "@/lib/db";

export const maxDuration = 300;
export const runtime = "nodejs";

/**
 * The nightly sync, as a real platform scheduled function (see
 * vercel.json's `crons` entry) instead of an in-process timer --
 * serverless instances are too short-lived to hold a setInterval, so a
 * timer that "works" in dev would silently just never fire in prod.
 *
 * Vercel signs cron requests with `Authorization: Bearer $CRON_SECRET`
 * automatically when CRON_SECRET is set as an env var, which is what
 * this checks. The sync itself is guarded by the same DB lock the
 * manual trigger uses (see lib/ig/sync-lock.ts), so a manual run and
 * this nightly run can't double-pull if they overlap.
 */
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // A cron request carries no session, so there is no account to infer.
  // Sync each account that actually has an Instagram connection, declaring
  // the account explicitly so every query underneath is scoped to it. One
  // account failing must not stop the others.
  const accounts = await query<{ account_id: number }>(
    `select distinct a.account_id
       from auth a
       join accounts acc on acc.id = a.account_id and acc.status = 'active'
      where a.access_token is not null
      order by a.account_id`,
  );

  const targets = accounts.length > 0 ? accounts.map((r) => r.account_id) : [1];
  const results: Record<string, unknown>[] = [];

  for (const accountId of targets) {
    try {
      const summary = await runAsAccount(accountId, () => runInstagramSync());
      results.push({ accountId, ok: true, ...summary });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[sync/cron] account ${accountId} failed:`, err);
      results.push({ accountId, ok: false, error: message });
    }
  }

  const anyFailed = results.some((r) => r.ok === false);
  return NextResponse.json({ accounts: results }, { status: anyFailed ? 207 : 200 });
}
