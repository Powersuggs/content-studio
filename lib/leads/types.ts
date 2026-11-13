/**
 * The shapes the leads page needs on both sides of the wire.
 *
 * Kept apart from queries.ts because that file reaches for the signed-in
 * account, which reaches for request headers, which cannot be bundled
 * into a browser. A client component importing a single type from it
 * dragged the whole server chain along and the build refused.
 */

/** Where he is with someone. */
export type LeadStatus = "new" | "to contact" | "contacted" | "replied" | "not a fit";

export const LEAD_STATUSES: LeadStatus[] = [
  "new",
  "to contact",
  "contacted",
  "replied",
  "not a fit",
];

/** How a handle turned up. */
export type LeadSource = "reference" | "board" | "teardown" | "manual";

export interface Lead {
  id: number;
  handle: string;
  platform: string;
  source: LeadSource;
  status: LeadStatus;
  note: string | null;
  first_seen: string;
  last_touched: string | null;
  /** How many of their posts the app has looked at. */
  posts_seen: number;
}
