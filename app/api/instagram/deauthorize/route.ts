import { NextResponse } from "next/server";
import { query } from "@/lib/db";

import { parseSignedRequest, readSignedRequest } from "@/lib/ig/signed-request";

/**
 * Meta's deauthorize callback. REQUIRED for App Review.
 *
 * Fires when someone removes this app from their Instagram or Facebook
 * settings rather than from inside this app. Their token is already dead at
 * that point, so the job here is to stop pretending otherwise: clear the
 * connection so the UI says "not connected" and the sync stops throwing on a
 * schedule.
 *
 * Deauthorizing is NOT deleting. Their posts and stats stay, because someone
 * who unplugs an integration has not asked to lose their history. Deletion
 * is the separate callback next door.
 */
export async function POST(request: Request) {
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appSecret) {
    console.error("[instagram/deauthorize] INSTAGRAM_APP_SECRET is not set");
    // 200 on purpose. Meta retries non-2xx, and retrying will not conjure
    // the missing secret; the log is where this gets noticed.
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  const signed = await readSignedRequest(request);

  try {
    const payload = parseSignedRequest(signed ?? "", appSecret);
    const igUserId = payload.user_id ? String(payload.user_id) : null;

    if (!igUserId) {
      console.error("[instagram/deauthorize] signed request carried no user_id");
      return NextResponse.json({ ok: false }, { status: 200 });
    }

    // Matched on ig_user_id, which is unique, so this cannot clear the wrong
    // account. Runs unscoped by design: there is no session here, and the
    // signature is what authorises it.
    const cleared = await query<{ account_id: string }>(
      `update auth
          set access_token       = null,
              token_refreshed_at = null,
              ig_user_id         = null,
              ig_username        = null,
              token_expires_at   = null,
              ig_scopes          = null,
              ig_connected_at    = null,
              updated_at         = now()
        where ig_user_id = $1
        returning account_id`,
      [igUserId],
    );

    console.log(
      `[instagram/deauthorize] cleared ${cleared.length} connection(s) for ig user ${igUserId}`,
    );
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    // A signature that does not verify means this did not come from Meta.
    console.error("[instagram/deauthorize] rejected:", err);
    return NextResponse.json({ error: "Invalid signed_request" }, { status: 400 });
  }
}
