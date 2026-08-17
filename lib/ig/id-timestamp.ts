/**
 * Instagram/Facebook internal numeric IDs (the "media_pk" portion of a
 * Graph API media id, e.g. "179948289..._178414..." -> the part before
 * the underscore) are Snowflake-style: the high bits encode milliseconds
 * since a fixed custom epoch. This is Instagram's original ID scheme
 * (documented publicly in Instagram's own 2012 engineering writeup on
 * sharding IDs): 41 bits of ms-since-epoch, then shard id, then a
 * per-shard sequence number, packed into a 63-bit integer.
 *
 * We use this ONLY as a last-resort fallback when a post genuinely has
 * no `timestamp` field from the API. It's an approximation -- good
 * enough to place a post in the right week/month, never used when a
 * real timestamp is available.
 *
 * IMPORTANT: never fall back to "now" instead. Defaulting an unknown
 * timestamp to the sync time collapses the whole import onto one day
 * and destroys every trend the dashboard depends on.
 */
const INSTAGRAM_ID_EPOCH_MS = 1314220021721n; // 2011-08-24T21:07:01.721Z
const TIMESTAMP_SHIFT_BITS = 22n;

export function decodeInstagramIdTimestamp(mediaId: string): Date | null {
  const numericPart = mediaId.split("_")[0];
  if (!/^\d+$/.test(numericPart)) return null;

  try {
    const idNum = BigInt(numericPart);
    const msSinceEpoch = idNum >> TIMESTAMP_SHIFT_BITS;
    const epochMs = msSinceEpoch + INSTAGRAM_ID_EPOCH_MS;
    const ms = Number(epochMs);
    if (!Number.isFinite(ms) || ms <= 0) return null;

    const date = new Date(ms);
    // Sanity bound: Instagram launched in 2010, so anything outside a
    // wide plausible window means the decode produced garbage (e.g. the
    // id wasn't actually one of these Snowflake-style ids) -- better to
    // return null and let the caller decide than silently store junk.
    const year = date.getUTCFullYear();
    if (year < 2010 || year > 2100) return null;

    return date;
  } catch {
    return null;
  }
}
