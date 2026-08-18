import { query, queryOne, withTransaction } from "./db";
import { postHappenedExpr, medianExpr, DEFAULT_APP_TIMEZONE } from "./analytics-sql";
import { getMyHandle, requireMyHandle } from "./my-handle";

// ---------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------
export interface ProfileHeaderData {
  handle: string | null;
  display_name: string | null;
  bio: string | null;
  followers_count: number;
  total_likes: number;
  video_count: number;
}

export async function getProfileHeader(): Promise<ProfileHeaderData> {
  // Profile fields (handle/name/bio/followers) come straight from the
  // singleton row. Likes/video-count are computed live from posts, but
  // ALWAYS scoped to that same handle -- reference posts never count.
  const row = await queryOne<{
    handle: string | null;
    display_name: string | null;
    bio: string | null;
    followers_count: number;
  }>(`select handle, display_name, bio, followers_count from profile where id = 1`);

  const handle = row?.handle ?? null;

  let total_likes = 0;
  let video_count = 0;
  if (handle) {
    const agg = await queryOne<{ total_likes: number; video_count: number }>(
      `select coalesce(sum(likes), 0) as total_likes, count(*) as video_count
       from posts
       where handle = $1`,
      [handle],
    );
    total_likes = agg?.total_likes ?? 0;
    video_count = agg?.video_count ?? 0;
  }

  return {
    handle,
    display_name: row?.display_name ?? null,
    bio: row?.bio ?? null,
    followers_count: row?.followers_count ?? 0,
    total_likes,
    video_count,
  };
}

export interface UpdateProfileInput {
  display_name?: string | null;
  handle?: string | null;
  bio?: string | null;
  followers_count?: number | null;
  ig_user_id?: string | null;
  ig_media_count?: number | null;
}

/**
 * Upsert pattern: RETURNING id, and null inputs mean "keep the stored
 * value" via COALESCE against the existing row rather than overwriting.
 * Shared by the profile-header inline edits AND the Instagram sync.
 */
export async function updateProfile(
  input: UpdateProfileInput,
): Promise<{ id: number }> {
  const row = await queryOne<{ id: number }>(
    `insert into profile (id, display_name, handle, bio, followers_count, ig_user_id, ig_media_count)
     values (1, $1, $2, $3, $4, $5, $6)
     on conflict (id) do update set
       display_name    = coalesce(excluded.display_name, profile.display_name),
       handle          = coalesce(excluded.handle, profile.handle),
       bio             = coalesce(excluded.bio, profile.bio),
       followers_count = coalesce(excluded.followers_count, profile.followers_count),
       ig_user_id      = coalesce(excluded.ig_user_id, profile.ig_user_id),
       ig_media_count  = coalesce(excluded.ig_media_count, profile.ig_media_count),
       updated_at      = now()
     returning id`,
    [
      input.display_name ?? null,
      input.handle ?? null,
      input.bio ?? null,
      input.followers_count ?? null,
      input.ig_user_id ?? null,
      input.ig_media_count ?? null,
    ],
  );
  if (!row) throw new Error("Profile upsert failed to return an id");
  return row;
}

// ---------------------------------------------------------------------
// Recent posts rail
// ---------------------------------------------------------------------
export interface RecentPost {
  id: number;
  thumb_url: string | null;
  caption: string | null;
  url: string | null;
  views: number;
  happened_on: string;
}

export async function getRecentPosts(limit = 20): Promise<RecentPost[]> {
  const handle = await requireMyHandle();
  const timezone = DEFAULT_APP_TIMEZONE;
  const params: unknown[] = [handle, timezone, limit];
  return query<RecentPost>(
    `select
       id, thumb_url, caption, url, views,
       ${postHappenedExpr(2)} as happened_on
     from posts
     where handle = $1
     order by ${postHappenedExpr(2)} desc nulls last, id desc
     limit $3`,
    params,
  );
}

// ---------------------------------------------------------------------
// AI insight cards
// ---------------------------------------------------------------------
export interface InsightCard {
  id: number;
  post_id: number | null;
  kind: string;
  content: string;
  created_at: string;
}

export async function getRecentInsights(limit = 12): Promise<InsightCard[]> {
  const handle = await requireMyHandle();
  // Pattern insights are stored with handle directly (they summarize
  // across many posts, not one), so filter on that -- never on an
  // unscoped `select * from insights`.
  return query<InsightCard>(
    `select id, post_id, kind, content, created_at
     from insights
     where handle = $1
     order by created_at desc
     limit $2`,
    [handle, limit],
  );
}

// ---------------------------------------------------------------------
// All-time stat tiles
// ---------------------------------------------------------------------
export interface AllTimeStats {
  total_posts: number;
  total_views: number;
  total_likes: number;
  total_comments: number;
  total_saves: number;
  total_shares: number;
  average_views: number;
}

export async function getAllTimeStats(): Promise<AllTimeStats> {
  const handle = await requireMyHandle();
  const row = await queryOne<AllTimeStats>(
    `select
       count(*)::int                     as total_posts,
       coalesce(sum(views), 0)           as total_views,
       coalesce(sum(likes), 0)           as total_likes,
       coalesce(sum(comments), 0)        as total_comments,
       coalesce(sum(saves), 0)           as total_saves,
       coalesce(sum(shares), 0)          as total_shares,
       coalesce(avg(views), 0)           as average_views
     from posts
     where handle = $1`,
    [handle],
  );
  return (
    row ?? {
      total_posts: 0,
      total_views: 0,
      total_likes: 0,
      total_comments: 0,
      total_saves: 0,
      total_shares: 0,
      average_views: 0,
    }
  );
}

// ---------------------------------------------------------------------
// 30-day averages vs prior 30 days
// ---------------------------------------------------------------------
export interface AverageMetric {
  current: number;
  previous: number | null;
  pct_change: number | null;
}

export interface AveragesRow {
  views: AverageMetric;
  likes: AverageMetric;
  saves: AverageMetric;
  shares: AverageMetric;
}

function pctChange(current: number, previous: number | null): number | null {
  if (previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export async function getAveragesLast30Days(): Promise<AveragesRow> {
  const handle = await requireMyHandle();
  const timezone = DEFAULT_APP_TIMEZONE;

  const row = await queryOne<{
    curr_views: number | null;
    prev_views: number | null;
    curr_likes: number | null;
    prev_likes: number | null;
    curr_saves: number | null;
    prev_saves: number | null;
    curr_shares: number | null;
    prev_shares: number | null;
  }>(
    `with bounds as (
       select (now() at time zone $2)::date as today
     ),
     scoped as (
       select ${postHappenedExpr(2)} as happened, views, likes, saves, shares
       from posts
       where handle = $1
     )
     select
       (select avg(views)  from scoped, bounds where happened >= bounds.today - 29 and happened <= bounds.today)              as curr_views,
       (select avg(views)  from scoped, bounds where happened >= bounds.today - 59 and happened <= bounds.today - 30)         as prev_views,
       (select avg(likes)  from scoped, bounds where happened >= bounds.today - 29 and happened <= bounds.today)              as curr_likes,
       (select avg(likes)  from scoped, bounds where happened >= bounds.today - 59 and happened <= bounds.today - 30)         as prev_likes,
       (select avg(saves)  from scoped, bounds where happened >= bounds.today - 29 and happened <= bounds.today)              as curr_saves,
       (select avg(saves)  from scoped, bounds where happened >= bounds.today - 59 and happened <= bounds.today - 30)         as prev_saves,
       (select avg(shares) from scoped, bounds where happened >= bounds.today - 29 and happened <= bounds.today)              as curr_shares,
       (select avg(shares) from scoped, bounds where happened >= bounds.today - 59 and happened <= bounds.today - 30)         as prev_shares
    `,
    [handle, timezone],
  );

  const currViews = row?.curr_views ?? 0;
  const currLikes = row?.curr_likes ?? 0;
  const currSaves = row?.curr_saves ?? 0;
  const currShares = row?.curr_shares ?? 0;
  const prevViews = row?.prev_views ?? null;
  const prevLikes = row?.prev_likes ?? null;
  const prevSaves = row?.prev_saves ?? null;
  const prevShares = row?.prev_shares ?? null;

  return {
    views: { current: currViews, previous: prevViews, pct_change: pctChange(currViews, prevViews) },
    likes: { current: currLikes, previous: prevLikes, pct_change: pctChange(currLikes, prevLikes) },
    saves: { current: currSaves, previous: prevSaves, pct_change: pctChange(currSaves, prevSaves) },
    shares: { current: currShares, previous: prevShares, pct_change: pctChange(currShares, prevShares) },
  };
}

// ---------------------------------------------------------------------
// 12-month posting heatmap
// ---------------------------------------------------------------------
export interface HeatmapDay {
  day: string; // YYYY-MM-DD, local calendar date
  count: number;
}

/**
 * One row per day for the last 12 months (locally-anchored calendar
 * dates, never toISOString()), with a post count for that day. Days
 * with zero posts are included with count 0 so the grid has no gaps.
 */
export async function getPostingHeatmap(): Promise<HeatmapDay[]> {
  const handle = await requireMyHandle();
  const timezone = DEFAULT_APP_TIMEZONE;

  return query<HeatmapDay>(
    `with bounds as (
       select (now() at time zone $2)::date as today
     ),
     days as (
       select generate_series(bounds.today - interval '364 days', bounds.today, interval '1 day')::date as day
       from bounds
     ),
     scoped as (
       select ${postHappenedExpr(2)} as happened
       from posts
       where handle = $1
     )
     select
       to_char(days.day, 'YYYY-MM-DD') as day,
       count(scoped.happened)::int as count
     from days
     left join scoped on scoped.happened = days.day
     group by days.day
     order by days.day asc`,
    [handle, timezone],
  );
}

// ---------------------------------------------------------------------
// AI feature support: post lookups, median rates, insight replacement,
// script storage. Every function here is scoped to the caller's own
// handle -- there is no code path that hands reference-creator posts to
// the model as if they were mine.
// ---------------------------------------------------------------------

export interface PostForAnalysis {
  id: number;
  happened_on: string;
  caption: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number;
  duration_s: number | null;
  avg_watch_s: number | null;
}

/** Full post history, own-handle only, newest first -- fuel for the compact table sent to the insights prompt. */
export async function getPostsForAnalysis(limit = 300): Promise<PostForAnalysis[]> {
  const handle = await requireMyHandle();
  const timezone = DEFAULT_APP_TIMEZONE;
  return query<PostForAnalysis>(
    `select
       id, caption, views, likes, comments, shares, saves, reach,
       duration_s, avg_watch_s,
       ${postHappenedExpr(2)} as happened_on
     from posts
     where handle = $1
     order by ${postHappenedExpr(2)} desc nulls last, id desc
     limit $3`,
    [handle, timezone, limit],
  );
}

export interface MedianRates {
  median_like_rate: number | null;
  median_comment_rate: number | null;
  median_share_rate: number | null;
  median_save_rate: number | null;
  median_views_to_reach: number | null;
  median_watch_rate: number | null;
}

/** Median engagement rates across my own post history, computed in SQL via percentile_cont. */
export async function getMyMedianRates(): Promise<MedianRates> {
  const handle = await requireMyHandle();
  const row = await queryOne<MedianRates>(
    `select
       ${medianExpr("likes::float8 / nullif(views, 0)")}                as median_like_rate,
       ${medianExpr("comments::float8 / nullif(views, 0)")}             as median_comment_rate,
       ${medianExpr("shares::float8 / nullif(views, 0)")}               as median_share_rate,
       ${medianExpr("saves::float8 / nullif(views, 0)")}                as median_save_rate,
       ${medianExpr("views::float8 / nullif(reach, 0)")}                as median_views_to_reach,
       ${medianExpr("avg_watch_s / nullif(duration_s, 0)")}             as median_watch_rate
     from posts
     where handle = $1`,
    [handle],
  );
  return (
    row ?? {
      median_like_rate: null,
      median_comment_rate: null,
      median_share_rate: null,
      median_save_rate: null,
      median_views_to_reach: null,
      median_watch_rate: null,
    }
  );
}

export interface PostDetail extends PostForAnalysis {
  url: string | null;
  thumb_url: string | null;
  review: string | null;
  verdict: string | null;
  script: string | null;
  pillar: string | null;
}

/** A single post, but ONLY if it belongs to my handle -- reviewing someone else's imported post is not allowed. */
export async function getMyPostById(postId: number): Promise<PostDetail | null> {
  const handle = await requireMyHandle();
  const timezone = DEFAULT_APP_TIMEZONE;
  return queryOne<PostDetail>(
    `select
       id, url, thumb_url, caption, script, views, likes, comments, shares, saves, reach,
       duration_s, avg_watch_s, review, verdict, pillar,
       ${postHappenedExpr(3)} as happened_on
     from posts
     where id = $1 and handle = $2`,
    [postId, handle, timezone],
  );
}

// ---------------------------------------------------------------------
// Content pillars: free-text categories the creator assigns to their
// own posts, so performance can be compared by content type.
// ---------------------------------------------------------------------

/** Set (or clear, with null/empty) the pillar tag on one of my own posts. */
export async function updatePostPillar(
  postId: number,
  pillar: string | null,
): Promise<{ id: number }> {
  const handle = await requireMyHandle();
  const cleaned = pillar?.trim() || null;
  const row = await queryOne<{ id: number }>(
    `update posts
     set pillar = $1
     where id = $2 and handle = $3
     returning id`,
    [cleaned, postId, handle],
  );
  if (!row) throw new Error("Post not found for this handle");
  return row;
}

/** Every distinct pillar label already used on my own posts, for autocomplete. */
export async function getDistinctPillars(): Promise<string[]> {
  const handle = await requireMyHandle();
  const rows = await query<{ pillar: string }>(
    `select distinct pillar
     from posts
     where handle = $1 and pillar is not null and pillar <> ''
     order by pillar asc`,
    [handle],
  );
  return rows.map((r) => r.pillar);
}

export interface PillarPerformance {
  pillar: string;
  post_count: number;
  avg_views: number;
  avg_likes: number;
  avg_saves: number;
  avg_shares: number;
}

/** Average performance grouped by content pillar, own handle only, best avg views first. Untagged posts group under "Untagged". */
export async function getPillarPerformance(): Promise<PillarPerformance[]> {
  const handle = await requireMyHandle();
  return query<PillarPerformance>(
    `select
       coalesce(nullif(pillar, ''), 'Untagged') as pillar,
       count(*)::int as post_count,
       avg(views)  as avg_views,
       avg(likes)  as avg_likes,
       avg(saves)  as avg_saves,
       avg(shares) as avg_shares
     from posts
     where handle = $1
     group by coalesce(nullif(pillar, ''), 'Untagged')
     order by avg_views desc nulls last`,
    [handle],
  );
}

export type Verdict = "win" | "flop" | "ok";

/** Store the AI review + verdict on the post itself, scoped to my handle. */
export async function saveReview(
  postId: number,
  review: string,
  verdict: Verdict,
): Promise<{ id: number }> {
  const handle = await requireMyHandle();
  const row = await queryOne<{ id: number }>(
    `update posts
     set review = $1, verdict = $2
     where id = $3 and handle = $4
     returning id`,
    [review, verdict, postId, handle],
  );
  if (!row) throw new Error("Post not found for this handle");
  return row;
}

export type InsightKind = "win" | "warning" | "idea";

export interface PatternInsightInput {
  kind: InsightKind;
  content: string;
}

/** Replace the entire stored set of pattern insights for my handle in one transaction. */
export async function replaceInsights(
  patterns: PatternInsightInput[],
): Promise<void> {
  const handle = await requireMyHandle();
  await withTransaction(async (client) => {
    await client.query(`delete from insights where handle = $1`, [handle]);
    for (const pattern of patterns) {
      await client.query(
        `insert into insights (post_id, handle, kind, content) values (null, $1, $2, $3)`,
        [handle, pattern.kind, pattern.content],
      );
    }
  });
}

export interface SaveScriptInput {
  postId: number | null;
  title: string;
  hook: string;
  body: string;
}

/** Store a generated script draft. RETURNING id per the upsert convention (this is a fresh insert, not a keyed upsert). */
export async function saveScript(input: SaveScriptInput): Promise<{ id: number }> {
  const row = await queryOne<{ id: number }>(
    `insert into scripts (post_id, title, hook, body, status)
     values ($1, $2, $3, $4, 'draft')
     returning id`,
    [input.postId, input.title, input.hook, input.body],
  );
  if (!row) throw new Error("Script insert failed to return an id");
  return row;
}

// ---------------------------------------------------------------------
// Tool pages: Autopsy, Session Prep, Boards, Inspiration, History,
// Session Mode (queued scripts). Every "mine" query stays scoped to
// requireMyHandle(); Inspiration is the one deliberate exception, and
// it explicitly excludes my handle rather than querying unscoped.
// ---------------------------------------------------------------------

// --- Autopsy: underperformers, worst first -----------------------------
export interface UnderperformingPost {
  id: number;
  happened_on: string;
  caption: string | null;
  thumb_url: string | null;
  views: number;
  median_views: number;
  pillar: string | null;
}

export async function getPostsBelowMedianViews(): Promise<UnderperformingPost[]> {
  const handle = await requireMyHandle();
  const timezone = DEFAULT_APP_TIMEZONE;
  return query<UnderperformingPost>(
    `with stats as (
       select ${medianExpr("views")} as median_views
       from posts
       where handle = $1
     )
     select
       posts.id, posts.caption, posts.thumb_url, posts.views, posts.pillar,
       ${postHappenedExpr(2, "posts")} as happened_on,
       stats.median_views
     from posts, stats
     where posts.handle = $1 and posts.views < stats.median_views
     order by posts.views asc`,
    [handle, timezone],
  );
}

// --- Session Prep: cadence, misses, change, top posts -------------------
export interface CadenceStats {
  posts_last_30: number;
  distinct_days_last_30: number;
  days_missed_last_30: number;
  posts_prior_30: number;
  pct_change_posts: number | null;
}

export async function getPostingCadence(): Promise<CadenceStats> {
  const handle = await requireMyHandle();
  const timezone = DEFAULT_APP_TIMEZONE;
  const row = await queryOne<{
    posts_last_30: number;
    distinct_days_last_30: number;
    posts_prior_30: number;
  }>(
    `with bounds as (
       select (now() at time zone $2)::date as today
     ),
     scoped as (
       select ${postHappenedExpr(2)} as happened
       from posts
       where handle = $1
     )
     select
       (select count(*) from scoped, bounds where happened >= bounds.today - 29 and happened <= bounds.today)::int as posts_last_30,
       (select count(distinct happened) from scoped, bounds where happened >= bounds.today - 29 and happened <= bounds.today)::int as distinct_days_last_30,
       (select count(*) from scoped, bounds where happened >= bounds.today - 59 and happened <= bounds.today - 30)::int as posts_prior_30
    `,
    [handle, timezone],
  );

  const postsLast30 = row?.posts_last_30 ?? 0;
  const distinctDays = row?.distinct_days_last_30 ?? 0;
  const postsPrior30 = row?.posts_prior_30 ?? 0;
  const pctChange =
    postsPrior30 === 0 ? null : ((postsLast30 - postsPrior30) / postsPrior30) * 100;

  return {
    posts_last_30: postsLast30,
    distinct_days_last_30: distinctDays,
    days_missed_last_30: 30 - distinctDays,
    posts_prior_30: postsPrior30,
    pct_change_posts: pctChange,
  };
}

export interface RemakeCandidate {
  id: number;
  caption: string | null;
  thumb_url: string | null;
  views: number;
  happened_on: string;
}

export async function getTopPostsForRemake(limit = 5): Promise<RemakeCandidate[]> {
  const handle = await requireMyHandle();
  const timezone = DEFAULT_APP_TIMEZONE;
  return query<RemakeCandidate>(
    `select id, caption, thumb_url, views, ${postHappenedExpr(2)} as happened_on
     from posts
     where handle = $1
     order by views desc
     limit $3`,
    [handle, timezone, limit],
  );
}

// --- Scripts: queue + teleprompter ---------------------------------------
export type ScriptStatus = "draft" | "queued" | "filmed";

export interface ScriptRecord {
  id: number;
  post_id: number | null;
  title: string | null;
  hook: string | null;
  body: string | null;
  status: string | null;
  created_at: string;
}

export async function updateScriptStatus(
  id: number,
  status: ScriptStatus,
): Promise<{ id: number }> {
  const row = await queryOne<{ id: number }>(
    `update scripts set status = $1 where id = $2 returning id`,
    [status, id],
  );
  if (!row) throw new Error("Script not found");
  return row;
}

export async function getQueuedScripts(): Promise<ScriptRecord[]> {
  // Scripts aren't handle-tagged directly (they're topic-driven, not
  // always tied to a post), so this is scoped implicitly by being a
  // single-user app behind the password gate rather than by handle --
  // there is no cross-creator "scripts" data to contaminate here.
  return query<ScriptRecord>(
    `select id, post_id, title, hook, body, status, created_at
     from scripts
     where status = 'queued'
     order by created_at asc`,
  );
}

// --- Boards: named collections with toggle membership --------------------
export interface BoardSummary {
  id: number;
  name: string;
  description: string | null;
  post_count: number;
}

export async function getBoardsList(): Promise<BoardSummary[]> {
  return query<BoardSummary>(
    `select boards.id, boards.name, boards.description, count(board_posts.post_id)::int as post_count
     from boards
     left join board_posts on board_posts.board_id = boards.id
     group by boards.id
     order by boards.created_at desc`,
  );
}

export async function createBoard(name: string, description: string | null): Promise<{ id: number }> {
  const row = await queryOne<{ id: number }>(
    `insert into boards (name, description) values ($1, $2) returning id`,
    [name, description],
  );
  if (!row) throw new Error("Board insert failed to return an id");
  return row;
}

export interface BoardPostToggle {
  id: number;
  thumb_url: string | null;
  caption: string | null;
  in_board: boolean;
}

/** All of MY posts, each flagged whether it's currently in the given board. */
export async function getBoardTogglePosts(boardId: number): Promise<BoardPostToggle[]> {
  const handle = await requireMyHandle();
  return query<BoardPostToggle>(
    `select
       posts.id, posts.thumb_url, posts.caption,
       (board_posts.post_id is not null) as in_board
     from posts
     left join board_posts on board_posts.board_id = $2 and board_posts.post_id = posts.id
     where posts.handle = $1
     order by posts.id desc`,
    [handle, boardId],
  );
}

export async function togglePostInBoard(
  boardId: number,
  postId: number,
): Promise<{ in_board: boolean }> {
  const existing = await queryOne<{ board_id: number }>(
    `select board_id from board_posts where board_id = $1 and post_id = $2`,
    [boardId, postId],
  );
  if (existing) {
    await query(`delete from board_posts where board_id = $1 and post_id = $2`, [boardId, postId]);
    return { in_board: false };
  }
  await query(`insert into board_posts (board_id, post_id) values ($1, $2)`, [boardId, postId]);
  return { in_board: true };
}

// --- Inspiration: reference creators, grouped by handle -------------------
export interface ReferencePost {
  id: number;
  handle: string;
  thumb_url: string | null;
  caption: string | null;
  url: string | null;
  views: number;
  happened_on: string;
  breakdown: string | null;
}

/**
 * The deliberate exception to "always scope to my handle": this is
 * reference material FROM other creators, so it explicitly excludes my
 * handle rather than filtering to it.
 */
export async function getReferencePostsGroupedByHandle(): Promise<
  Record<string, ReferencePost[]>
> {
  const myHandle = await getMyHandle();
  const timezone = DEFAULT_APP_TIMEZONE;
  const rows = await query<ReferencePost>(
    `select p.id, p.handle, p.thumb_url, p.caption, p.url, p.views,
            ${postHappenedExpr(2, "p")} as happened_on,
            i.content as breakdown
     from posts p
     left join lateral (
       select content from insights
       where insights.post_id = p.id and insights.kind = 'breakdown'
       order by insights.created_at desc
       limit 1
     ) i on true
     where p.handle is distinct from $1
     order by p.handle asc, ${postHappenedExpr(2, "p")} desc nulls last`,
    [myHandle, timezone],
  );
  const grouped: Record<string, ReferencePost[]> = {};
  for (const row of rows) {
    const key = row.handle || "unknown";
    (grouped[key] ??= []).push(row);
  }
  return grouped;
}

/**
 * Remove a reference post from Inspiration. Scoped with the same
 * `handle is distinct from mine` guard as the read query above, so this
 * can never delete one of my own synced posts even if a bad id is
 * passed in -- only imported reference posts are deletable here.
 */
export async function deleteReferencePost(postId: number): Promise<void> {
  const myHandle = await getMyHandle();
  const row = await queryOne<{ id: number }>(
    `delete from posts
     where id = $1 and handle is distinct from $2
     returning id`,
    [postId, myHandle],
  );
  if (!row) throw new Error("Reference post not found (or it belongs to your own handle)");
}

// --- Inspiration: importing a reference post from another creator ---------
export interface CreateReferencePostInput {
  platform: "instagram" | "tiktok" | "reference";
  handle: string;
  url: string | null;
  caption: string | null;
}

/**
 * Insert a reference post from another creator. Unlike upsertPost() (which
 * keys off a real platform media id from a synced API), reference posts are
 * hand-entered, so we derive a stable external_id from the URL when we have
 * one, or a random token when we don't -- either way it satisfies the same
 * (platform, external_id) uniqueness upsertPost relies on, so re-submitting
 * the same link updates the existing row instead of duplicating it.
 */
export async function createReferencePost(
  input: CreateReferencePostInput,
): Promise<{ id: number }> {
  const externalId = input.url ?? `manual-${crypto.randomUUID()}`;
  const timezone = DEFAULT_APP_TIMEZONE;
  const row = await queryOne<{ id: number }>(
    `insert into posts (platform, external_id, handle, url, caption, posted_at, views)
     values ($1, $2, $3, $4, $5, (now() at time zone $6)::date, 0)
     on conflict (platform, external_id) do update set
       handle  = excluded.handle,
       caption = coalesce(excluded.caption, posts.caption)
     returning id`,
    [input.platform, externalId, input.handle, input.url, input.caption, timezone],
  );
  if (!row) throw new Error("Reference post insert failed to return an id");
  return row;
}

/** Store (or replace) the AI reverse-engineer breakdown for a reference post. */
export async function saveReferenceBreakdown(
  postId: number,
  handle: string,
  content: string,
): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `delete from insights where post_id = $1 and kind = 'breakdown'`,
      [postId],
    );
    await client.query(
      `insert into insights (post_id, handle, kind, content) values ($1, $2, 'breakdown', $3)`,
      [postId, handle, content],
    );
  });
}

// --- History: my posts, newest first --------------------------------------
export interface HistoryPost extends RecentPost {
  pillar: string | null;
}

export async function getAllMyPostsHistory(limit = 500): Promise<HistoryPost[]> {
  const handle = await requireMyHandle();
  const timezone = DEFAULT_APP_TIMEZONE;
  return query<HistoryPost>(
    `select id, thumb_url, caption, url, views, pillar, ${postHappenedExpr(2)} as happened_on
     from posts
     where handle = $1
     order by ${postHappenedExpr(2)} desc nulls last, id desc
     limit $3`,
    [handle, timezone, limit],
  );
}

// ---------------------------------------------------------------------
// Instagram sync support: upsert posts, backfill watch time.
// ---------------------------------------------------------------------

export interface UpsertPostInput {
  platform: string;
  external_id: string;
  handle: string;
  url: string | null;
  thumb_url: string | null;
  caption: string | null;
  posted_at: string; // YYYY-MM-DD, already resolved (timestamp or decoded ID) -- never "today" as a default
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number;
}

/**
 * Upsert one post keyed on (platform, external_id). RETURNING id, and
 * every nullable text field uses COALESCE so a sync pass that happens
 * to get a null caption etc. doesn't clobber a previously-good value.
 * Numeric counters always come from the API on every sync (they're
 * never null), so those are overwritten outright -- that's the whole
 * point of re-syncing.
 */
export async function upsertPost(input: UpsertPostInput): Promise<{ id: number }> {
  const row = await queryOne<{ id: number }>(
    `insert into posts (
       platform, external_id, handle, url, thumb_url, caption, posted_at,
       views, likes, comments, shares, saves, reach
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     on conflict (platform, external_id) do update set
       handle     = coalesce(excluded.handle, posts.handle),
       url        = coalesce(excluded.url, posts.url),
       thumb_url  = coalesce(excluded.thumb_url, posts.thumb_url),
       caption    = coalesce(excluded.caption, posts.caption),
       posted_at  = coalesce(excluded.posted_at, posts.posted_at),
       views      = excluded.views,
       likes      = excluded.likes,
       comments   = excluded.comments,
       shares     = excluded.shares,
       saves      = excluded.saves,
       reach      = excluded.reach
     returning id`,
    [
      input.platform,
      input.external_id,
      input.handle,
      input.url,
      input.thumb_url,
      input.caption,
      input.posted_at,
      input.views,
      input.likes,
      input.comments,
      input.shares,
      input.saves,
      input.reach,
    ],
  );
  if (!row) throw new Error("Post upsert failed to return an id");
  return row;
}

export interface WatchTimeCandidate {
  id: number;
  external_id: string;
}

/**
 * Posts due for a watch-time backfill pass, capped to `limit`.
 * Never-fetched posts (watch_time_synced_at is null) come first; once a
 * post has been fetched at least once, recent posts (whose numbers are
 * more likely to still be moving) are prioritized for a refresh. The
 * rest fill in over subsequent runs rather than all at once.
 */
export async function getPostsNeedingWatchTimeBackfill(
  handle: string,
  limit: number,
): Promise<WatchTimeCandidate[]> {
  const timezone = DEFAULT_APP_TIMEZONE;
  return query<WatchTimeCandidate>(
    `select id, external_id
     from posts
     where handle = $1
     order by
       (watch_time_synced_at is null) desc,
       ${postHappenedExpr(2)} desc nulls last
     limit $3`,
    [handle, timezone, limit],
  );
}

export async function updateWatchTime(
  postId: number,
  avgWatchS: number | null,
  totalWatchS: number | null,
): Promise<void> {
  await queryOne(
    `update posts
     set avg_watch_s = $1, total_watch_s = $2, watch_time_synced_at = now()
     where id = $3`,
    [avgWatchS, totalWatchS, postId],
  );
}

export interface SyncStatus {
  sync_status: string;
  last_synced_at: string | null;
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const row = await queryOne<SyncStatus>(
    `select sync_status, last_synced_at::text as last_synced_at from profile where id = 1`,
  );
  return row ?? { sync_status: "idle", last_synced_at: null };
}
