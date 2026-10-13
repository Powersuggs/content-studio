import { queryOne } from "@/lib/db";
import { currentAccountId } from "@/lib/auth/current-account";

/**
 * Where an account's Instagram connection lives.
 *
 * This used to be two global environment variables, which meant the app
 * could only ever sync one Instagram account: the owner's. Now each account
 * row owns its own identity, written by the OAuth callback.
 *
 * The environment variables are kept as a BOOTSTRAP for account 1 only --
 * the owner connected their Instagram by hand long before this flow
 * existed, and silently disconnecting them on deploy would be a poor
 * trade for tidiness. New accounts never read them.
 */

export interface InstagramConnection {
  igUserId: string;
  token: string;
  username: string | null;
  refreshedAt: Date | null;
  expiresAt: Date | null;
  grantedScopes: string[];
  connectedAt: Date | null;
}

interface AuthRow {
  access_token: string | null;
  token_refreshed_at: string | null;
  ig_user_id: string | null;
  ig_username: string | null;
  ig_connected_at: string | null;
  token_expires_at: string | null;
  ig_scopes: string | null;
}

const SELECT_COLUMNS = `access_token, token_refreshed_at, ig_user_id, ig_username,
         ig_connected_at, token_expires_at, ig_scopes`;

/**
 * The account's Instagram connection, or null if they have not connected one.
 *
 * Returns null rather than throwing, because "not connected yet" is the
 * normal state for every new account and the settings page needs to render
 * that state, not an error page.
 */
export async function getConnection(): Promise<InstagramConnection | null> {
  const accountId = await currentAccountId();

  const row = await queryOne<AuthRow>(
    `select ${SELECT_COLUMNS} from auth where account_id = $1`,
    [accountId],
  );

  if (row?.access_token && row.ig_user_id) {
    return {
      igUserId: row.ig_user_id,
      token: row.access_token,
      username: row.ig_username,
      refreshedAt: row.token_refreshed_at ? new Date(row.token_refreshed_at) : null,
      expiresAt: row.token_expires_at ? new Date(row.token_expires_at) : null,
      grantedScopes: parseScopes(row.ig_scopes),
      connectedAt: row.ig_connected_at ? new Date(row.ig_connected_at) : null,
    };
  }

  // Partially stored connection: a token but no user id. That is the shape
  // the pre-OAuth owner row has, since the user id lived in an env var.
  // Fill in the missing half from the environment rather than calling it
  // unconnected, which would strand the owner's existing sync.
  if (row?.access_token && !row.ig_user_id) {
    const envUserId = process.env.INSTAGRAM_USER_ID;
    if (envUserId && accountId === OWNER_ACCOUNT_ID) {
      await persistConnection({
        igUserId: envUserId,
        accessToken: row.access_token,
        // The true age is unknown. "Assume fresh" is the safe guess:
        // Instagram rejects refreshing a token under 24h old, so guessing
        // "old" would break the very next sync.
        refreshedAt: row.token_refreshed_at ? new Date(row.token_refreshed_at) : new Date(),
        expiresAt: null,
        grantedScopes: [],
      });
      return {
        igUserId: envUserId,
        token: row.access_token,
        username: row.ig_username,
        refreshedAt: row.token_refreshed_at ? new Date(row.token_refreshed_at) : new Date(),
        expiresAt: null,
        grantedScopes: [],
        connectedAt: row.ig_connected_at ? new Date(row.ig_connected_at) : null,
      };
    }
    return null;
  }

  // Nothing stored at all. Seed from the environment, owner only.
  if (accountId === OWNER_ACCOUNT_ID) {
    const envToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    const envUserId = process.env.INSTAGRAM_USER_ID;
    if (envToken && envUserId) {
      const assumedFresh = new Date();
      await persistConnection({
        igUserId: envUserId,
        accessToken: envToken,
        refreshedAt: assumedFresh,
        expiresAt: null,
        grantedScopes: [],
      });
      return {
        igUserId: envUserId,
        token: envToken,
        username: null,
        refreshedAt: assumedFresh,
        expiresAt: null,
        grantedScopes: [],
        connectedAt: null,
      };
    }
  }

  return null;
}

/**
 * The owner is account 1 by construction: migration 0009 created exactly one
 * account row and backfilled every pre-existing record to it.
 */
const OWNER_ACCOUNT_ID = 1;

export async function persistConnection(input: {
  igUserId: string;
  accessToken: string;
  refreshedAt: Date | null;
  expiresAt: Date | null;
  grantedScopes: string[];
  username?: string | null;
}): Promise<void> {
  const accountId = await currentAccountId();

  await queryOne(
    `insert into auth (account_id, access_token, token_refreshed_at, ig_user_id,
                       ig_username, token_expires_at, ig_scopes, ig_connected_at)
     values ($1, $2, $3, $4, $5, $6, $7, now())
     on conflict (account_id) do update set
       access_token       = excluded.access_token,
       token_refreshed_at = excluded.token_refreshed_at,
       ig_user_id         = excluded.ig_user_id,
       -- A refresh does not re-fetch the username, so do not let it blank
       -- out one we already have.
       ig_username        = coalesce(excluded.ig_username, auth.ig_username),
       token_expires_at   = excluded.token_expires_at,
       ig_scopes          = coalesce(excluded.ig_scopes, auth.ig_scopes),
       ig_connected_at    = coalesce(auth.ig_connected_at, excluded.ig_connected_at),
       updated_at         = now()
     returning id`,
    [
      accountId,
      input.accessToken,
      input.refreshedAt ? input.refreshedAt.toISOString() : null,
      input.igUserId,
      input.username ?? null,
      input.expiresAt ? input.expiresAt.toISOString() : null,
      input.grantedScopes.length ? input.grantedScopes.join(",") : null,
    ],
  );
}

/** Called after a token refresh, which changes the token and nothing else. */
export async function persistRefreshedToken(
  token: string,
  refreshedAt: Date,
  expiresAt: Date | null,
): Promise<void> {
  const accountId = await currentAccountId();
  await queryOne(
    `update auth
        set access_token       = $2,
            token_refreshed_at = $3,
            token_expires_at   = coalesce($4, token_expires_at),
            updated_at         = now()
      where account_id = $1
      returning id`,
    [accountId, token, refreshedAt.toISOString(), expiresAt ? expiresAt.toISOString() : null],
  );
}

export async function persistUsername(username: string): Promise<void> {
  const accountId = await currentAccountId();
  await queryOne(
    `update auth set ig_username = $2, updated_at = now()
      where account_id = $1 returning id`,
    [accountId, username],
  );
}

/**
 * Forget the connection, keeping the account and its posts.
 *
 * Deliberately does not delete synced posts. Someone reconnecting a
 * mistakenly disconnected account would otherwise lose their whole history,
 * and the posts are the valuable part. Deleting data is what the data
 * deletion flow is for, and that is a separate, explicit act.
 */
export async function clearConnection(): Promise<void> {
  const accountId = await currentAccountId();
  await queryOne(
    `update auth
        set access_token       = null,
            token_refreshed_at = null,
            ig_user_id         = null,
            ig_username        = null,
            token_expires_at   = null,
            ig_scopes          = null,
            ig_connected_at    = null,
            updated_at         = now()
      where account_id = $1
      returning id`,
    [accountId],
  );
}

function parseScopes(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
