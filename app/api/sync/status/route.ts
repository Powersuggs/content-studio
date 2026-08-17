import { NextResponse } from "next/server";
import { getSyncStatus } from "@/lib/queries";

// Route Handlers are cached by default when Next.js can't prove they're
// dynamic. A plain DB read with no cookies/headers usage looks "static"
// to that analysis, so without this, the response can get frozen at
// build/deploy time and every poll afterward silently gets that same
// stale answer forever -- exactly why the sync button kept spinning
// even after the sync had actually finished (or failed) on the server.
export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getSyncStatus();
  return NextResponse.json(status, {
    headers: { "Cache-Control": "no-store" },
  });
}
