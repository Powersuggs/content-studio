import { queryOne } from "./db";

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
    `select handle from profile where id = 1`,
  );
  return row?.handle ?? null;
}

/**
 * Same as getMyHandle(), but throws if no handle is configured yet.
 * Prefer this in stat/dashboard queries so a missing profile fails loudly
 * instead of silently returning cross-creator data.
 */
export async function requireMyHandle(): Promise<string> {
  const handle = await getMyHandle();
  if (!handle) {
    throw new Error(
      "No profile handle configured yet. Set your Instagram handle in the profile header before viewing stats.",
    );
  }
  return handle;
}
