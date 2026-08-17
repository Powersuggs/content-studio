const GRAPH_BASE = "https://graph.instagram.com";
const GRAPH_VERSION = "v22.0";

// Metric names as of Graph API v22+ (impressions/video_views were
// deprecated Jan 2025 in favor of the unified "views" metric).
// Requested as an expanded `insights` field on the /media call so this
// costs one request per PAGE of posts, not one per post.
const MEDIA_INSIGHT_METRICS = ["views", "reach", "saved", "shares"] as const;

// Watch-time metrics are Reels-only and, per Meta's docs, only queryable
// via the per-media /insights endpoint -- they cannot be pulled through
// the same field-expansion trick as the metrics above. Hence the
// separate backfill pass in sync.ts.
const WATCH_TIME_METRICS = [
  "ig_reels_avg_watch_time",
  "ig_reels_video_view_total_time",
] as const;

class GraphApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
    this.name = "GraphApiError";
  }
}

async function graphFetch<T>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${GRAPH_VERSION ? `/${GRAPH_VERSION}` : ""}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url.toString(), { method: "GET" });
  const body = await res.json();
  if (!res.ok) {
    // Vercel's log view collapses nested objects to "[Object]" -- put
    // the actual Meta error text directly in the message string so it's
    // readable in the one-line log entry, not just on a `.body` property
    // that never gets printed.
    const metaMessage =
      (body && typeof body === "object" && "error" in body
        ? (body as { error?: { message?: string; type?: string; code?: number } }).error
            ?.message
        : null) ?? JSON.stringify(body);
    throw new GraphApiError(
      `Graph API request failed: ${path} (${res.status}): ${metaMessage}`,
      res.status,
      body,
    );
  }
  return body as T;
}

// -----------------------------------------------------------------------
// Profile
// -----------------------------------------------------------------------
export interface IgProfileResponse {
  id: string;
  username: string;
  name?: string;
  biography?: string;
  followers_count?: number;
  media_count?: number;
}

export async function fetchProfile(
  igUserId: string,
  accessToken: string,
): Promise<IgProfileResponse> {
  return graphFetch<IgProfileResponse>(`/${igUserId}`, {
    fields: "id,username,name,biography,followers_count,media_count",
    access_token: accessToken,
  });
}

// -----------------------------------------------------------------------
// Media, paginated, with insights expanded inline
// -----------------------------------------------------------------------
export interface IgInsightValue {
  name: string;
  period: string;
  values: { value: number }[];
}

export interface IgMediaNode {
  id: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  insights?: { data: IgInsightValue[] };
}

export interface IgMediaPage {
  data: IgMediaNode[];
  paging?: { next?: string; cursors?: { after?: string } };
}

function insightValue(node: IgMediaNode, metric: string): number {
  const entry = node.insights?.data.find((d) => d.name === metric);
  return entry?.values?.[0]?.value ?? 0;
}

export interface NormalizedMedia {
  external_id: string;
  caption: string | null;
  url: string | null;
  thumb_url: string | null;
  timestamp: string | null;
  likes: number;
  comments: number;
  views: number;
  reach: number;
  saves: number;
  shares: number;
}

export function normalizeMedia(node: IgMediaNode): NormalizedMedia {
  return {
    external_id: node.id,
    caption: node.caption ?? null,
    url: node.permalink ?? null,
    thumb_url: node.thumbnail_url ?? node.media_url ?? null,
    timestamp: node.timestamp ?? null,
    likes: node.like_count ?? 0,
    comments: node.comments_count ?? 0,
    views: insightValue(node, "views"),
    reach: insightValue(node, "reach"),
    saves: insightValue(node, "saved"),
    shares: insightValue(node, "shares"),
  };
}

const BASIC_FIELDS = [
  "id",
  "caption",
  "media_type",
  "media_url",
  "thumbnail_url",
  "permalink",
  "timestamp",
  "like_count",
  "comments_count",
] as const;

function fieldsParam(includeInsights: boolean): string {
  const fields = includeInsights
    ? [...BASIC_FIELDS, `insights.metric(${MEDIA_INSIGHT_METRICS.join(",")})`]
    : [...BASIC_FIELDS];
  return fields.join(",");
}

/**
 * Instagram refuses to return insights (views/reach/saves/shares) for
 * any post published BEFORE the account was converted from personal to
 * Business/Creator -- and since insights is requested as part of the
 * same combined field list, one old post in a page fails the WHOLE
 * page's request, not just that post's insights. Rather than aborting
 * the entire sync the first time an old post is encountered, detect
 * that specific failure and retry the same page without insights, so
 * older posts still get imported (with 0 views/reach/etc, which is
 * accurate -- Instagram genuinely has no insights data for them).
 */
function isPreConversionInsightsError(err: unknown): boolean {
  return (
    err instanceof GraphApiError &&
    typeof err.message === "string" &&
    err.message.includes("posted before the most recent time")
  );
}

/**
 * Fetch every page of media for the account, yielding one normalized
 * batch per page. The `insights.metric(...)` field expansion below is
 * what makes this one request per PAGE rather than one per post, for
 * accounts where every post postdates the Business/Creator conversion.
 */
export async function* iterateAllMedia(
  igUserId: string,
  accessToken: string,
  pageSize = 50,
): AsyncGenerator<NormalizedMedia[]> {
  let nextUrl: string | null = null;
  const basePath = `/${igUserId}/media`;

  async function fetchPage(includeInsights: boolean): Promise<IgMediaPage> {
    if (nextUrl) {
      // nextUrl already encodes its own `fields` param from the previous
      // request, so to retry without insights we have to swap it out
      // rather than just re-fetching the same URL.
      const url = new URL(nextUrl);
      url.searchParams.set("fields", fieldsParam(includeInsights));
      const res = await fetch(url.toString());
      const body = await res.json();
      if (!res.ok) {
        const metaMessage =
          (body && typeof body === "object" && "error" in body
            ? (body as { error?: { message?: string } }).error?.message
            : null) ?? JSON.stringify(body);
        throw new GraphApiError(
          `Graph API pagination request failed (${res.status}): ${metaMessage}`,
          res.status,
          body,
        );
      }
      return body as IgMediaPage;
    }
    return graphFetch<IgMediaPage>(basePath, {
      fields: fieldsParam(includeInsights),
      limit: String(pageSize),
      access_token: accessToken,
    });
  }

  while (true) {
    let page: IgMediaPage;
    try {
      page = await fetchPage(true);
    } catch (err) {
      if (isPreConversionInsightsError(err)) {
        // Fall back to basic fields only -- these posts predate
        // Business/Creator conversion, so views/reach/etc. will be 0,
        // which is the accurate answer, not a bug.
        page = await fetchPage(false);
      } else {
        throw err;
      }
    }

    yield (page.data ?? []).map(normalizeMedia);

    if (!page.paging?.next) break;
    nextUrl = page.paging.next;
  }
}

// -----------------------------------------------------------------------
// Watch time (per-post backfill pass)
// -----------------------------------------------------------------------
export interface WatchTimeResult {
  avg_watch_s: number | null;
  total_watch_s: number | null;
}

export async function fetchWatchTime(
  mediaId: string,
  accessToken: string,
): Promise<WatchTimeResult> {
  try {
    const res = await graphFetch<{ data: IgInsightValue[] }>(
      `/${mediaId}/insights`,
      { metric: WATCH_TIME_METRICS.join(","), access_token: accessToken },
    );
    const avgMs = res.data.find((d) => d.name === "ig_reels_avg_watch_time")
      ?.values?.[0]?.value;
    const totalMs = res.data.find(
      (d) => d.name === "ig_reels_video_view_total_time",
    )?.values?.[0]?.value;

    return {
      // Metric values come back in milliseconds -- convert to seconds
      // to match the posts.avg_watch_s / total_watch_s column units.
      avg_watch_s: typeof avgMs === "number" ? avgMs / 1000 : null,
      total_watch_s: typeof totalMs === "number" ? totalMs / 1000 : null,
    };
  } catch (err) {
    // Non-video posts (images, carousels without video) don't have
    // these metrics and the API returns an error rather than zeros --
    // that's expected, not a sync failure.
    if (err instanceof GraphApiError) {
      return { avg_watch_s: null, total_watch_s: null };
    }
    throw err;
  }
}

// -----------------------------------------------------------------------
// Token refresh
// -----------------------------------------------------------------------
export interface RefreshedToken {
  access_token: string;
  expires_in: number;
}

/**
 * Instagram's long-lived-token refresh endpoint. Long-lived tokens are
 * valid 60 days and refreshable once they're at least 24h old -- this
 * is what keeps the integration from dying every two months.
 */
export async function refreshLongLivedToken(
  currentToken: string,
): Promise<RefreshedToken> {
  const url = new URL(`${GRAPH_BASE}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", currentToken);

  const res = await fetch(url.toString());
  const body = await res.json();
  if (!res.ok) {
    const metaMessage =
      (body && typeof body === "object" && "error_message" in body
        ? (body as { error_message?: string }).error_message
        : null) ??
      (body && typeof body === "object" && "error" in body
        ? (body as { error?: { message?: string } }).error?.message
        : null) ??
      JSON.stringify(body);
    throw new GraphApiError(
      `Failed to refresh access token: ${metaMessage}`,
      res.status,
      body,
    );
  }
  return body as RefreshedToken;
}

export { GraphApiError };
