import { queryOne } from "@/lib/db";

const DEFAULT_SKIP_WINDOW_MINUTES = 10; // don't re-run if one finished this recently
const DEFAULT_STALE_AFTER_MINUTES = 30; // a "running" lock older than this is treated as abandoned (crashed run)

export type AcquireResult =
  | { acquired: true }
  | { acquired: false; reason: "already-running" | "synced-recently" };

/**
 * Atomically claim the sync lock in one UPDATE ... WHERE ... RETURNING,
 * so a manual trigger and the nightly cron racing each other can't both
 * think they got the lock. Returns whether we actually acquired it.
 */
export async function acquireSyncLock(
  opts: {
    skipWindowMinutes?: number;
    staleAfterMinutes?: number;
  } = {},
): Promise<AcquireResult> {
  const skipWindow = opts.skipWindowMinutes ?? DEFAULT_SKIP_WINDOW_MINUTES;
  const staleAfter = opts.staleAfterMinutes ?? DEFAULT_STALE_AFTER_MINUTES;

  const claimed = await queryOne<{ id: number }>(
    `update profile
     set sync_status = 'running', sync_started_at = now()
     where id = 1
       and (
         -- idle and not synced within the skip window
         (sync_status = 'idle' and (last_synced_at is null or last_synced_at < now() - ($1 || ' minutes')::interval))
         -- or a "running" lock old enough to be an abandoned/crashed run
         or (sync_status = 'running' and sync_started_at < now() - ($2 || ' minutes')::interval)
       )
     returning id`,
    [String(skipWindow), String(staleAfter)],
  );

  if (claimed) return { acquired: true };

  // Figure out *why* we didn't get it, just for a clearer log/response.
  const current = await queryOne<{ sync_status: string; last_synced_at: string | null }>(
    `select sync_status, last_synced_at from profile where id = 1`,
  );
  if (current?.sync_status === "running") {
    return { acquired: false, reason: "already-running" };
  }
  return { acquired: false, reason: "synced-recently" };
}

/** Release the lock after a successful sync and stamp last_synced_at. */
export async function releaseSyncLockSuccess(): Promise<void> {
  await queryOne(
    `update profile set sync_status = 'idle', sync_started_at = null, last_synced_at = now() where id = 1`,
  );
}

/** Release the lock after a failed sync WITHOUT touching last_synced_at, so the next attempt isn't skipped as "recent". */
export async function releaseSyncLockFailure(): Promise<void> {
  await queryOne(
    `update profile set sync_status = 'idle', sync_started_at = null where id = 1`,
  );
}
