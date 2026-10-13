/**
 * The platforms a person can list on their profile.
 *
 * Each entry knows how to turn a handle into a link, because every platform
 * does it differently and getting it wrong sends someone to a 404 from a
 * button that was supposed to save them a search.
 *
 * `analytics` records whether this app can actually read numbers from the
 * platform yet. It is false for most of them, and the UI says so plainly
 * rather than implying data is coming that is not.
 */

export type PlatformId =
  | "instagram"
  | "facebook"
  | "tiktok"
  | "youtube"
  | "linkedin"
  | "x"
  | "pinterest"
  | "threads";

export interface Platform {
  id: PlatformId;
  label: string;
  /** Shown inside the input so people know what to type. */
  placeholder: string;
  /** Whether the app can read metrics from this platform today. */
  analytics: boolean;
  /** Builds the public profile link from a handle. */
  profileUrl: (handle: string) => string;
  /** Short note shown under the field. */
  hint?: string;
}

/**
 * Strips the things people paste in without thinking: a leading @, a full
 * URL when only the handle was asked for, and any trailing slash or query
 * string. Someone pasting their whole profile URL is the common case, not
 * the exception, so handle it rather than rejecting it.
 */
export function normalizeHandle(raw: string): string {
  let h = raw.trim();
  if (!h) return "";

  // A pasted URL: take the last meaningful path segment.
  if (/^https?:\/\//i.test(h) || h.includes("/")) {
    h = h.replace(/[?#].*$/, "").replace(/\/+$/, "");
    const parts = h.split("/").filter(Boolean);
    h = parts[parts.length - 1] ?? "";
  }

  return h.replace(/^@+/, "").trim();
}

export const PLATFORMS: Platform[] = [
  {
    id: "instagram",
    label: "Instagram",
    placeholder: "yourhandle",
    analytics: true,
    profileUrl: (h) => `https://instagram.com/${h}`,
  },
  {
    id: "facebook",
    label: "Facebook",
    placeholder: "YourPageName",
    analytics: false,
    profileUrl: (h) => `https://facebook.com/${h}`,
    hint: "Your Page name, not your personal profile.",
  },
  {
    id: "tiktok",
    label: "TikTok",
    placeholder: "yourhandle",
    analytics: false,
    profileUrl: (h) => `https://tiktok.com/@${h}`,
  },
  {
    id: "youtube",
    label: "YouTube",
    placeholder: "yourhandle",
    analytics: false,
    profileUrl: (h) => `https://youtube.com/@${h}`,
    hint: "The @handle from your channel, not the long channel ID.",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    placeholder: "your-name-123",
    analytics: false,
    profileUrl: (h) => `https://linkedin.com/in/${h}`,
    hint: "The part after /in/ in your profile link.",
  },
  {
    id: "x",
    label: "X",
    placeholder: "yourhandle",
    analytics: false,
    profileUrl: (h) => `https://x.com/${h}`,
  },
  {
    id: "pinterest",
    label: "Pinterest",
    placeholder: "yourhandle",
    analytics: false,
    profileUrl: (h) => `https://pinterest.com/${h}`,
  },
  {
    id: "threads",
    label: "Threads",
    placeholder: "yourhandle",
    analytics: false,
    profileUrl: (h) => `https://threads.net/@${h}`,
  },
];

const BY_ID = new Map(PLATFORMS.map((p) => [p.id, p]));

export function getPlatform(id: string): Platform | undefined {
  return BY_ID.get(id as PlatformId);
}

export function isPlatformId(id: string): id is PlatformId {
  return BY_ID.has(id as PlatformId);
}
