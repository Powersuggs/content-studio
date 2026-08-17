import type { PostForAnalysis } from "@/lib/queries";

function pct(n: number, d: number): string {
  if (!d) return "-";
  return `${((n / d) * 100).toFixed(1)}%`;
}

function truncateCaption(caption: string | null): string {
  if (!caption) return "-";
  const oneLine = caption.replace(/\s+/g, " ").trim();
  const chars = Array.from(oneLine);
  return chars.length > 60 ? `${chars.slice(0, 57).join("")}...` : oneLine;
}

/**
 * Compact pipe-delimited table: one row per post, own-handle only.
 * Rates are computed inline so the model doesn't have to do arithmetic.
 */
export function buildPostsTable(posts: PostForAnalysis[]): string {
  const header =
    "id | date | views | reach | views/reach | likes | comments | shares | saves | save_rate | share_rate | duration_s | avg_watch_s | watch_rate | caption";
  const rows = posts.map((p) => {
    const viewsToReach = p.reach ? (p.views / p.reach).toFixed(2) : "-";
    const saveRate = pct(p.saves, p.views);
    const shareRate = pct(p.shares, p.views);
    const watchRate =
      p.duration_s && p.avg_watch_s ? pct(p.avg_watch_s, p.duration_s) : "-";
    return [
      p.id,
      p.happened_on,
      p.views,
      p.reach,
      viewsToReach,
      p.likes,
      p.comments,
      p.shares,
      p.saves,
      saveRate,
      shareRate,
      p.duration_s ?? "-",
      p.avg_watch_s ?? "-",
      watchRate,
      truncateCaption(p.caption),
    ].join(" | ");
  });
  return [header, ...rows].join("\n");
}
