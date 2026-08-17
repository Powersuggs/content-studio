import { queryOne } from "@/lib/db";

/**
 * The token starts life in an env var, but after the first refresh the
 * *new* token only exists in the database -- the env var is never
 * rewritten. So: DB value wins whenever it's present; env var is only
 * the bootstrap value for a brand new install.
 */
export async function getStoredAccessToken(): Promise<{
  token: string;
  refreshedAt: Date | null;
} | null> {
  const row = await queryOne<{ access_token: string | null; token_refreshed_at: string | null }>(
    `select access_token, token_refreshed_at from auth where id = 1`,
  );

  if (row?.access_token) {
    if (row.token_refreshed_at) {
      return {
        token: row.access_token,
        refreshedAt: new Date(row.token_refreshed_at),
      };
    }
    // Self-heal: an earlier version of this app could save a token with
    // no refreshedAt, which then read back as "infinitely old" and
    // forced a refresh attempt on every sync -- even for a brand-new
    // token, which Instagram rejects (tokens must be 24h+ old to
    // refresh). Treat a missing refreshedAt as "assume fresh" instead.
    const assumedFresh = new Date();
    await persistAccessToken(row.access_token, assumedFresh);
    return { token: row.access_token, refreshedAt: assumedFresh };
  }

  const envToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!envToken) return null;

  // Seed the DB from the env var so subsequent runs (and refreshes)
  // have a durable place to write the rotated token to. We don't know
  // this token's TRUE age, but it's reasonable to assume it was just
  // generated (the person setting this up almost certainly just created
  // it in Meta's UI) -- treat "just seeded" as "just refreshed" rather
  // than "infinitely old", so we don't immediately try to refresh a
  // brand-new token. Instagram rejects refreshing a token less than 24h
  // old, so guessing "old" here would break the very first sync.
  const assumedFresh = new Date();
  await persistAccessToken(envToken, assumedFresh);
  return { token: envToken, refreshedAt: assumedFresh };
}

export async function persistAccessToken(
  token: string,
  refreshedAt: Date | null,
): Promise<void> {
  await queryOne(
    `insert into auth (id, access_token, token_refreshed_at)
     values (1, $1, $2)
     on conflict (id) do update set
       access_token       = coalesce(excluded.access_token, auth.access_token),
       token_refreshed_at = coalesce(excluded.token_refreshed_at, auth.token_refreshed_at),
       updated_at         = now()
     returning id`,
    [token, refreshedAt ? refreshedAt.toISOString() : null],
  );
}
