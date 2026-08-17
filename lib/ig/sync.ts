import {
  fetchProfile,
  iterateAllMedia,
  fetchWatchTime,
  refreshLongLivedToken,
} from "./client";
import { getStoredAccessToken, persistAccessToken } from "./token-store";
import { resolvePostedAt } from "./resolve-date";
import {
  upsertPost,
  updateWatchTime,
  getPostsNeedingWatchTimeBackfill,
  updateProfile,
} from "@/lib/queries";
import { DEFAULT_APP_TIMEZONE } from "@/lib/analytics-sql";
import {
  acquireSyncLock,
  releaseSyncLockSuccess,
  releaseSyncLockFailure,
} from "./sync-lock";

// Refresh proactively once the token is this many days old, well inside
// Instagram's 60-day expiry, so a run that gets skipped once or twice
// (locked out, offline, etc.) still leaves plenty of runway.
const TOKEN_REFRESH_THRESHOLD_DAYS = 5;

// Watch-time requires one request per post (see client.ts), so this is
// capped per run rather than backfilling the whole library at once --
// the rest fills in over subsequent runs.
const WATCH_TIME_BATCH_SIZE = 30;

async function maybeRefreshAccessToken(
  token: string,
  refreshedAt: Date | null,
): Promise<string> {
  const ageMs = refreshedAt ? Date.now() - refreshedAt.getTime() : Infinity;
  const thresholdMs = TOKEN_REFRESH_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
  if (ageMs < thresholdMs) return token;

  const refreshed = await refreshLongLivedToken(token);
  await persistAccessToken(refreshed.access_token, new Date());
  return refreshed.access_token;
}

export interface SyncSummary {
  ran: boolean;
  reason?: string;
  postsUpserted?: number;
  watchTimeBackfilled?: number;
}

export async function runInstagramSync(): Promise<SyncSummary> {
  const lock = await acquireSyncLock();
  if (!lock.acquired) {
    return { ran: false, reason: lock.reason };
  }

  try {
    const igUserId = process.env.INSTAGRAM_USER_ID;
    if (!igUserId) {
      throw new Error("INSTAGRAM_USER_ID environment variable is not set");
    }

    const stored = await getStoredAccessToken();
    if (!stored) {
      throw new Error(
        "No Instagram access token available (set INSTAGRAM_ACCESS_TOKEN)",
      );
    }

    const accessToken = await maybeRefreshAccessToken(
      stored.token,
      stored.refreshedAt,
    );
    const timezone = DEFAULT_APP_TIMEZONE;

    // --- Profile -------------------------------------------------------
    const profile = await fetchProfile(igUserId, accessToken);
    await updateProfile({
      handle: profile.username,
      display_name: profile.name ?? null,
      bio: profile.biography ?? null,
      followers_count: profile.followers_count ?? null,
      ig_user_id: profile.id,
      ig_media_count: profile.media_count ?? null,
    });

    // --- Media, paginated, insights expanded inline ---------------------
    let postsUpserted = 0;
    for await (const batch of iterateAllMedia(igUserId, accessToken)) {
      for (const media of batch) {
        // Never default to "now" -- resolvePostedAt throws rather than
        // guessing if both the API timestamp and the ID decode fail.
        // A post we genuinely can't date is skipped, not mis-dated.
        let postedAt: string;
        try {
          postedAt = resolvePostedAt(media.external_id, media.timestamp, timezone);
        } catch (err) {
          console.error(`[sync] skipping media ${media.external_id}:`, err);
          continue;
        }

        await upsertPost({
          platform: "instagram",
          external_id: media.external_id,
          handle: profile.username,
          url: media.url,
          thumb_url: media.thumb_url,
          caption: media.caption,
          posted_at: postedAt,
          views: media.views,
          likes: media.likes,
          comments: media.comments,
          shares: media.shares,
          saves: media.saves,
          reach: media.reach,
        });
        postsUpserted++;
      }
    }

    // --- Watch-time backfill: capped batch, never-fetched first --------
    const candidates = await getPostsNeedingWatchTimeBackfill(
      profile.username,
      WATCH_TIME_BATCH_SIZE,
    );
    let watchTimeBackfilled = 0;
    for (const post of candidates) {
      const watchTime = await fetchWatchTime(post.external_id, accessToken);
      await updateWatchTime(post.id, watchTime.avg_watch_s, watchTime.total_watch_s);
      watchTimeBackfilled++;
    }

    await releaseSyncLockSuccess();
    return { ran: true, postsUpserted, watchTimeBackfilled };
  } catch (err) {
    await releaseSyncLockFailure();
    throw err;
  }
}
