import { toLocalDateString } from "@/lib/date-utils";
import { decodeInstagramIdTimestamp } from "./id-timestamp";

/**
 * Resolve the local calendar date ("YYYY-MM-DD") a post happened on.
 *
 * Priority:
 *   1. The API's `timestamp` field, if present.
 *   2. Decoded from the platform media ID, if the timestamp is missing.
 *
 * Deliberately has NO third fallback to "now" -- if both of the above
 * fail, this throws, because storing today's date for an unknown-age
 * post would collapse the whole history onto one day and destroy every
 * trend the dashboard depends on. Callers should skip/flag the post
 * instead of catching this and substituting a default.
 */
export function resolvePostedAt(
  externalId: string,
  apiTimestamp: string | null | undefined,
  timezone: string,
): string {
  if (apiTimestamp) {
    const parsed = new Date(apiTimestamp);
    if (!Number.isNaN(parsed.getTime())) {
      return toLocalDateString(parsed, timezone);
    }
  }

  const decoded = decodeInstagramIdTimestamp(externalId);
  if (decoded) {
    return toLocalDateString(decoded, timezone);
  }

  throw new Error(
    `Cannot resolve a post date for media ${externalId}: no timestamp from the API and the ID could not be decoded. Refusing to default to today.`,
  );
}
