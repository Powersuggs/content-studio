import {
  fetchProfile,
  iterateAllMedia,
  fetchWatchTime,
  refreshLongLivedToken,
} from "./client";
import { needsRefresh } from "./oauth";
import {
  getConnection,
  persistRefreshedToken,
  persistUsername,
  type InstagramConnection,
} from "./token-store";
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

// Watch-time requires one request per post (see client.ts), so this is
// capped per run rather than backfilling the whole library at once --
// the rest fills in over subsequent runs.
const WATCH_TIME_BATCH_SIZE = 30;

/**
 * Keeps the long-lived token alive.
 *
 * The decision of *whether* to refresh lives in needsRefresh(), which knows
 * the two rules that matter: Instagram refuses to refresh a token less than
 * 24 hours old, and an already-expired token cannot be refreshed at all --
 * that one needs the person to reconnect, and no amount of retrying will
 * substitute.
 */
async function maybeRefreshAccessToken(
  connection: InstagramConnection,
): Promise<string> {
  if (!needsRefresh(connection.expiresAt, connection.refreshedAt)) {
    return connection.token;
  }

  const refreshed = await refreshLongLivedToken(connection.token);
  const refreshedAt = new Date();
  const expiresAt = refreshed.expires_in
    ? new Date(refreshedAt.getTime() + refreshed.expires_in * 1000)
    : null;

  await persistRefreshedToken(refreshed.access_token, refreshedAt, expiresAt);
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
    // Whose Instagram this is comes from the account's own row now, not from
    // a global environment variable. A sync run therefore syncs exactly the
    // account it is running as, and an account with nothing connected is a
    // no-op rather than an error: that is the normal state for a new signup,
    // and the scheduler walks every account.
    const connection = await getConnection();
    if (!connection) {
      await releaseSyncLockSuccess();
      return { ran: false, reason: "no Instagram account connected" };
    }

    const igUserId = connection.igUserId;
    const accessToken = await maybeRefreshAccessToken(connection);
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

    // Keep the handle shown on the settings page honest -- people do rename
    // their Instagram account. Only written when it actually changed, so the
    // common case stays a read.
    if (profile.username && profile.username !== connection.username) {
      await persistUsername(profile.username);
    }

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
