import { NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/ig/oauth";
import { clearConnection } from "@/lib/ig/token-store";

/**
 * Disconnect Instagram from this account.
 *
 * POST only. A GET here would mean any image tag or link preview could
 * silently unplug someone's integration.
 */
export async function POST() {
  try {
    await clearConnection();
    const target = new URL("/settings", getBaseUrl());
    target.searchParams.set("ig_ok", "Instagram disconnected. Your posts and stats are kept.");
    return NextResponse.redirect(target, 303);
  } catch (err) {
    console.error("[instagram/disconnect]", err);
    const target = new URL("/settings", getBaseUrl());
    target.searchParams.set("ig_error", "Could not disconnect. Try again.");
    return NextResponse.redirect(target, 303);
  }
}
