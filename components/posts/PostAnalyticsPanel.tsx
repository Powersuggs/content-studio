import type { PostDetail, MedianRates } from "@/lib/queries";

function rate(n: number, d: number): number | null {
  if (!d) return null;
  return n / d;
}

function fmtPct(v: number | null): string {
  return v === null ? "-" : `${(v * 100).toFixed(1)}%`;
}

function fmtDeltaPct(current: number | null, median: number | null): { text: string; positive: boolean | null } {
  if (current === null || median === null || median === 0) {
    return { text: "no median yet", positive: null };
  }
  const deltaPct = ((current - median) / median) * 100;
  return {
    text: `${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(0)}% vs. median`,
    positive: deltaPct >= 0,
  };
}

function Metric({
  label,
  current,
  median,
  formatCurrent,
}: {
  label: string;
  current: number | null;
  median: number | null;
  formatCurrent: (v: number | null) => string;
}) {
  const delta = fmtDeltaPct(current, median);
  const color =
    delta.positive === null ? "text-faint" : delta.positive ? "text-accent" : "text-warn";
  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <p className="text-xs text-faint">{label}</p>
      <p className="mt-1 text-lg font-semibold text-text">{formatCurrent(current)}</p>
      <p className={`mt-1 text-xs ${color}`}>{delta.text}</p>
    </div>
  );
}

export default function PostAnalyticsPanel({
  post,
  medians,
}: {
  post: PostDetail;
  medians: MedianRates;
}) {
  const likeRate = rate(post.likes, post.views);
  const commentRate = rate(post.comments, post.views);
  const shareRate = rate(post.shares, post.views);
  const saveRate = rate(post.saves, post.views);
  const engagementRate = rate(
    post.likes + post.comments + post.shares + post.saves,
    post.views,
  );
  const replays = rate(post.views, post.reach);
  const watchRate =
    post.duration_s && post.avg_watch_s ? post.avg_watch_s / post.duration_s : null;

  const medianEngagementRate =
    medians.median_like_rate !== null &&
    medians.median_comment_rate !== null &&
    medians.median_share_rate !== null &&
    medians.median_save_rate !== null
      ? medians.median_like_rate +
        medians.median_comment_rate +
        medians.median_share_rate +
        medians.median_save_rate
      : null;

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-text">Analytics</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Metric label="Like rate" current={likeRate} median={medians.median_like_rate} formatCurrent={fmtPct} />
        <Metric label="Comment rate" current={commentRate} median={medians.median_comment_rate} formatCurrent={fmtPct} />
        <Metric label="Share rate" current={shareRate} median={medians.median_share_rate} formatCurrent={fmtPct} />
        <Metric label="Save rate" current={saveRate} median={medians.median_save_rate} formatCurrent={fmtPct} />
        <Metric label="Engagement rate" current={engagementRate} median={medianEngagementRate} formatCurrent={fmtPct} />
        <Metric
          label="Replays (views/reach)"
          current={replays}
          median={medians.median_views_to_reach}
          formatCurrent={(v) => (v === null ? "-" : v.toFixed(2))}
        />
        <Metric
          label="Watch time"
          current={watchRate}
          median={medians.median_watch_rate}
          formatCurrent={() =>
            post.avg_watch_s !== null ? `${post.avg_watch_s.toFixed(1)}s avg` : "not tracked"
          }
        />
      </div>
    </section>
  );
}
