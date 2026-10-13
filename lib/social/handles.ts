import { query, queryOne } from "@/lib/db";
import { currentAccountId } from "@/lib/auth/current-account";
import {
  getPlatform,
  isPlatformId,
  normalizeHandle,
  type PlatformId,
} from "./platforms";

/**
 * Reading and writing the account's social handles.
 *
 * Every query here is account-scoped the usual way, so row-level security
 * covers it and one account can never read or overwrite another's handles.
 */

export interface SocialHandle {
  id: string;
  platform: PlatformId;
  handle: string;
  profileUrl: string;
  connection: "manual" | "oauth";
  connectedAt: Date | null;
}

interface Row {
  id: string;
  platform: string;
  handle: string;
  profile_url: string | null;
  connection: string;
  connected_at: string | null;
  sort_order: number;
}

function toHandle(row: Row): SocialHandle | null {
  if (!isPlatformId(row.platform)) return null;
  const platform = getPlatform(row.platform);
  if (!platform) return null;

  return {
    id: String(row.id),
    platform: row.platform,
    handle: row.handle,
    // Fall back to the computed link if none was stored, so a row written
    // before this column existed still produces a working button.
    profileUrl: row.profile_url || platform.profileUrl(row.handle),
    connection: row.connection === "oauth" ? "oauth" : "manual",
    connectedAt: row.connected_at ? new Date(row.connected_at) : null,
  };
}

export async function listHandles(): Promise<SocialHandle[]> {
  const accountId = await currentAccountId();

  const rows = await query<Row>(
    `select id, platform, handle, profile_url, connection, connected_at, sort_order
       from social_handles
      where account_id = $1
      order by sort_order, platform`,
    [accountId],
  );

  return rows.map(toHandle).filter((h): h is SocialHandle => h !== null);
}

/**
 * Saves a handle, or removes it when the field is cleared.
 *
 * Clearing is a deliberate part of saving rather than a separate delete
 * button: emptying the box and pressing save is what people expect to mean
 * "I do not have one of these".
 */
export async function saveHandle(
  platformId: string,
  rawHandle: string,
): Promise<void> {
  if (!isPlatformId(platformId)) {
    throw new Error(`Unknown platform: ${platformId}`);
  }
  const platform = getPlatform(platformId)!;
  const accountId = await currentAccountId();
  const handle = normalizeHandle(rawHandle);

  if (!handle) {
    // Only ever removes a typed-in row. A real connection has to be
    // disconnected properly so its token is revoked, not dropped by
    // clearing a text box.
    await query(
      `delete from social_handles
        where account_id = $1 and platform = $2 and connection = 'manual'`,
      [accountId, platformId],
    );
    return;
  }

  await queryOne(
    `insert into social_handles (account_id, platform, handle, profile_url, sort_order)
     values ($1, $2, $3, $4, $5)
     on conflict (account_id, platform) do update set
       handle      = excluded.handle,
       profile_url = excluded.profile_url,
       updated_at  = now()
     returning id`,
    [
      accountId,
      platformId,
      handle,
      platform.profileUrl(handle),
      // Keeps the list in the order the platforms are declared in, which is
      // the order they appear on the settings page.
      PLATFORM_ORDER[platformId] ?? 0,
    ],
  );
}

const PLATFORM_ORDER: Record<string, number> = {
  instagram: 0,
  facebook: 1,
  tiktok: 2,
  youtube: 3,
  linkedin: 4,
  x: 5,
  pinterest: 6,
  threads: 7,
};
