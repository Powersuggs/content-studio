import { NextResponse } from "next/server";

import {
  performDeletion,
  recordDeletionRequest,
} from "@/lib/ig/data-deletion";
import { getBaseUrl } from "@/lib/ig/oauth";
import { parseSignedRequest, readSignedRequest } from "@/lib/ig/signed-request";

/**
 * Meta's data deletion callback. REQUIRED for App Review.
 *
 * Someone asks Instagram (not us) to delete their data, and Meta POSTs here.
 * Meta expects exactly two things back, in JSON:
 *
 *   { "url": "<a page a human can open to check on it>",
 *     "confirmation_code": "<an id they can quote>" }
 *
 * Both are mandatory. A response missing either one is a review rejection,
 * and so is a `url` that 404s or needs a login -- Meta's reviewer opens it.
 *
 * The deletion itself runs before we answer. It is a handful of DELETEs
 * against one account, so it finishes in well under Meta's timeout, and doing
 * it inline means the status page cannot claim "completed" for work that was
 * silently dropped by a serverless function shutting down after the response
 * was flushed.
 */
export async function POST(request: Request) {
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appSecret) {
    console.error("[instagram/data-deletion] INSTAGRAM_APP_SECRET is not set");
    return NextResponse.json(
      { error: "Data deletion is not configured." },
      { status: 500 },
    );
  }

  const signed = await readSignedRequest(request);

  let igUserId: string;
  try {
    const payload = parseSignedRequest(signed ?? "", appSecret);
    if (!payload.user_id) {
      console.error("[instagram/data-deletion] signed request carried no user_id");
      return NextResponse.json(
        { error: "Invalid signed_request" },
        { status: 400 },
      );
    }
    igUserId = String(payload.user_id);
  } catch (err) {
    // No valid signature means this did not come from Meta, and this endpoint
    // deletes things. Refuse.
    console.error("[instagram/data-deletion] rejected:", err);
    return NextResponse.json({ error: "Invalid signed_request" }, { status: 400 });
  }

  // Record first, delete second. If the deletion throws, the request row
  // survives marked 'failed', so the status page can say so instead of
  // leaving the person with a code that matches nothing.
  let code: string;
  try {
    code = await recordDeletionRequest(igUserId);
  } catch (err) {
    console.error("[instagram/data-deletion] could not record request:", err);
    return NextResponse.json(
      { error: "Could not record the deletion request." },
      { status: 500 },
    );
  }

  try {
    await performDeletion(code);
  } catch (err) {
    // Already logged and already marked 'failed' by performDeletion. Still
    // hand back the url and code: Meta requires them, and the status page
    // reporting a failure honestly is better than a 500 that tells the
    // person nothing and tells us only that Meta will retry.
    console.error("[instagram/data-deletion] deletion failed for", code, err);
  }

  const statusUrl = new URL(`/instagram-data-deletion/${code}`, getBaseUrl());

  return NextResponse.json({
    url: statusUrl.toString(),
    confirmation_code: code,
  });
}
