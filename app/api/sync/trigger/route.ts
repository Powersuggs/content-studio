import { NextResponse } from "next/server";
import { after } from "next/server";
import { runInstagramSync } from "@/lib/ig/sync";

// A full sync (paginated media + capped watch-time backfill) can take
// minutes; ordinary serverless functions time out in tens of seconds.
// So: `after()` schedules the sync to run after the response is sent,
// and this route returns 202 immediately rather than awaiting it. The
// browser is expected to poll /api/sync/status until last_synced_at
// moves, not wait on this request.
//
// maxDuration extends how long THIS function is allowed to keep running
// in the background after the response flushes (platform-dependent --
// e.g. Vercel Fluid compute / background functions). Without it the
// platform default (often 10-15s) would kill the sync before it
// finishes, even though the HTTP response already went out.
export const maxDuration = 300;

export async function POST() {
  after(async () => {
    try {
      const summary = await runInstagramSync();
      if (!summary.ran) {
        console.log(`[sync/trigger] skipped: ${summary.reason}`);
      } else {
        console.log(
          `[sync/trigger] done: ${summary.postsUpserted} posts, ${summary.watchTimeBackfilled} watch-time backfills`,
        );
      }
    } catch (err) {
      console.error("[sync/trigger] background sync failed:", err);
    }
  });

  return NextResponse.json({ triggered: true }, { status: 202 });
}
