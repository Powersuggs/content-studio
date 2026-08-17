import { NextResponse } from "next/server";
import { runInstagramSync } from "@/lib/ig/sync";

export const maxDuration = 300;

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

  try {
    const summary = await runInstagramSync();
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[sync/cron] failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
