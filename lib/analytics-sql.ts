/**
 * Shared SQL building blocks for anything windowed by "when did this post
 * happen" or that needs a median. Keeping these in one place means every
 * query (dashboard, per-post comparison, pattern analysis, etc.) agrees on
 * the same definition instead of drifting.
 */

import { query } from "./db";

export const DEFAULT_APP_TIMEZONE = process.env.APP_TIMEZONE || "UTC";

/**
 * SQL fragment (as text) for "the date this post happened":
 *   - posted_at when it's present (this is the date Instagram reports),
 *   - otherwise created_at (a timestamptz, i.e. an instant) converted into
 *     the given IANA timezone and truncated to a date.
 *
 * This is a *fragment*, not a full parser -- splice it into a larger query
 * with `postHappenedExpr()` and bind the timezone as a query parameter
 * (never string-interpolate the timezone value itself).
 *
 * Usage:
 *   const tzParamIndex = params.push(DEFAULT_APP_TIMEZONE); // e.g. becomes $3
 *   const sql = `
 *     select ${postHappenedExpr(tzParamIndex)} as happened_on, views
 *     from posts
 *     where ${postHappenedExpr(tzParamIndex)} >= $1
 *   `;
 */
export function postHappenedExpr(
  timezoneParamIndex: number,
  table = "posts",
): string {
  return `coalesce(${table}.posted_at, (${table}.created_at at time zone $${timezoneParamIndex})::date)`;
}

/**
 * SQL fragment for a median of a numeric column/expression, computed
 * server-side via percentile_cont (never pulled into JS and sorted there).
 */
export function medianExpr(columnOrExpr: string): string {
  return `percentile_cont(0.5) within group (order by ${columnOrExpr})`;
}

export interface WindowedMedians {
  median_views: number | null;
  median_likes: number | null;
  median_comments: number | null;
  median_shares: number | null;
  median_saves: number | null;
  median_reach: number | null;
}

/**
 * Example consumer: medians across a post's own history, windowed by
 * "when it happened" in the given timezone. Every future windowed query
 * (dashboard cards, per-post comparison, pattern analysis) should follow
 * this same shape: bind the timezone once, reuse postHappenedExpr().
 */
export async function getMediansForHandle(
  handle: string,
  opts: { since?: string; timezone?: string } = {},
): Promise<WindowedMedians> {
  const timezone = opts.timezone ?? DEFAULT_APP_TIMEZONE;
  const params: unknown[] = [handle, timezone];
  const timezoneParamIndex = 2;

  let sinceClause = "";
  if (opts.since) {
    params.push(opts.since);
    sinceClause = `and ${postHappenedExpr(timezoneParamIndex)} >= $${params.length}`;
  }

  const sql = `
    select
      ${medianExpr("views")}    as median_views,
      ${medianExpr("likes")}    as median_likes,
      ${medianExpr("comments")} as median_comments,
      ${medianExpr("shares")}   as median_shares,
      ${medianExpr("saves")}    as median_saves,
      ${medianExpr("reach")}    as median_reach
    from posts
    where handle = $1
    ${sinceClause}
  `;

  const rows = await query<WindowedMedians>(sql, params);
  return (
    rows[0] ?? {
      median_views: null,
      median_likes: null,
      median_comments: null,
      median_shares: null,
      median_saves: null,
      median_reach: null,
    }
  );
}
