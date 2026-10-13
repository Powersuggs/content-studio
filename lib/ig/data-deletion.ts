import { randomBytes } from "node:crypto";
import { query, queryOne } from "@/lib/db";

/**
 * Honouring a data deletion request.
 *
 * Meta requires that an app accept a deletion request, hand back a URL where
 * the person can watch it progress, and actually carry it out. The second
 * part is what most App Review submissions get rejected for: a callback that
 * returns a plausible URL and deletes nothing.
 *
 * WHAT GETS DELETED
 * Everything derived from Instagram: the synced posts, their metrics, the
 * AI analysis of them, and the connection itself.
 *
 * WHAT SURVIVES
 * The person's own work -- scripts they wrote, their voice profile, their
 * boards. That material did not come from Instagram and deleting it would
 * go beyond what was asked. Closing the whole account is a separate,
 * explicit action, offered on the deletion page.
 *
 * These queries run WITHOUT a session, because Meta calls the callback
 * directly, so each one carries an explicit account_id. There is no ambient
 * account context to rely on here.
 */

/** Tables holding Instagram-derived rows, in foreign-key-safe order. */
const INSTAGRAM_DERIVED_TABLES = [
  // Children first: board_posts references posts.
  "board_posts",
  "insights",
  "remakes",
  "posts",
] as const;

export interface DeletionRequest {
  code: string;
  status: "pending" | "completed" | "failed";
  requestedAt: Date;
  completedAt: Date | null;
}

/**
 * Records the request and returns its confirmation code.
 *
 * The code is 32 random bytes rather than anything derived from the user, so
 * it cannot be guessed to read someone else's deletion status.
 */
export async function recordDeletionRequest(igUserId: string): Promise<string> {
  const code = randomBytes(24).toString("base64url");

  const owner = await queryOne<{ account_id: string }>(
    `select account_id from auth where ig_user_id = $1`,
    [igUserId],
  );

  await queryOne(
    `insert into data_deletion_requests (code, ig_user_id, account_id, status)
     values ($1, $2, $3, 'pending')
     returning code`,
    [code, igUserId, owner?.account_id ?? null],
  );

  return code;
}

/**
 * Carries out the deletion.
 *
 * Writes the outcome to the request row either way, so the status URL tells
 * the truth rather than claiming success because the endpoint returned 200.
 */
export async function performDeletion(code: string): Promise<void> {
  const req = await queryOne<{ ig_user_id: string | null; account_id: string | null }>(
    `select ig_user_id, account_id from data_deletion_requests
      where code = $1 and status = 'pending'`,
    [code],
  );
  if (!req) return;

  try {
    const accountId = req.account_id ? Number(req.account_id) : null;

    if (accountId) {
      for (const table of INSTAGRAM_DERIVED_TABLES) {
        // Table names come from the frozen list above, never from input.
        // scoping-exempt: account_id is passed explicitly; this runs with no session.
        await query(`delete from ${table} where account_id = $1`, [accountId]);
      }

      // The connection itself, and the Instagram fields on their profile.
      // scoping-exempt: explicit account_id, no session available.
      await query(
        `update auth
            set access_token = null, token_refreshed_at = null, ig_user_id = null,
                ig_username = null, token_expires_at = null, ig_scopes = null,
                ig_connected_at = null, updated_at = now()
          where account_id = $1`,
        [accountId],
      );

      // scoping-exempt: explicit account_id, no session available.
      await query(
        `update profile
            set ig_user_id = null, ig_media_count = null, followers_count = null,
                updated_at = now()
          where account_id = $1`,
        [accountId],
      );
    } else if (req.ig_user_id) {
      // No local account matched -- the connection was already gone. Clear
      // any stragglers keyed on the Instagram id so the request is honest
      // about having left nothing behind.
      // scoping-exempt: keyed on the unique ig_user_id, no session available.
      await query(
        `update auth set access_token = null, ig_user_id = null, ig_username = null
          where ig_user_id = $1`,
        [req.ig_user_id],
      );
    }

    await queryOne(
      `update data_deletion_requests
          set status = 'completed', completed_at = now()
        where code = $1 returning code`,
      [code],
    );
  } catch (err) {
    console.error("[data-deletion] failed for", code, err);
    await queryOne(
      `update data_deletion_requests set status = 'failed' where code = $1 returning code`,
      [code],
    ).catch(() => undefined);
    throw err;
  }
}

export async function getDeletionRequest(code: string): Promise<DeletionRequest | null> {
  const row = await queryOne<{
    code: string;
    status: "pending" | "completed" | "failed";
    requested_at: string;
    completed_at: string | null;
  }>(
    `select code, status, requested_at, completed_at
       from data_deletion_requests where code = $1`,
    [code],
  );
  if (!row) return null;

  return {
    code: row.code,
    status: row.status,
    requestedAt: new Date(row.requested_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
  };
}
