import { queryOne } from "./db";
import { currentAccountId } from "./auth/current-account";

/**
 * The single source of truth for "which posts are mine."
 *
 * This app imports other creators' posts as reference material alongside
 * my own Instagram history. Every statistic, average, heatmap cell, and
 * AI analysis input MUST be scoped to `posts.handle = <my handle>` or
 * reference posts will silently contaminate the numbers.
 *
 * Rule: no query in lib/queries.ts (or anywhere else) should aggregate
 * over `posts` without binding handle through getMyHandle() /
 * requireMyHandle(). There is no "all posts" query in this app.
 */
export async function getMyHandle(): Promise<string | null> {
  const row = await queryOne<{ handle: string | null }>(
    `select handle from profile where account_id = $1`,
    [await currentAccountId()],
  );
  return row?.handle ?? null;
}

/**
 * Same as getMyHandle(), but throws if no handle is configured yet.
 * Prefer this in stat/dashboard queries so a missing profile fails loudly
 * instead of silently returning cross-creator data.
 */
/**
 * Marker on the "no handle yet" error.
 *
 * Throwing here is right -- a stats query with no handle would otherwise
 * return other creators' rows -- but it is a state the reader can fix, not
 * a fault. Pages need to tell those apart, and matching on the message text
 * would break the first time someone reworded it.
 */
export const NO_HANDLE = "NO_HANDLE";

export class MissingHandleError extends Error {
  readonly code = NO_HANDLE;
  constructor() {
    super(
      "No profile handle configured yet. Set your Instagram handle in the profile header before viewing stats.",
    );
    this.name = "MissingHandleError";
  }
}

export async function requireMyHandle(): Promise<string> {
  const handle = await getMyHandle();
  if (!handle) throw new MissingHandleError();
  return handle;
}
