import Link from "next/link";
import { getPostsBelowMedianViews, getPillarPerformance } from "@/lib/queries";

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatAvg(n: number): string {
  return n >= 10 ? n.toFixed(0) : n.toFixed(1);
}

export default async function AutopsyPage() {
  const [posts, pillarPerformance] = await Promise.all([
    getPostsBelowMedianViews(),
    getPillarPerformance(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-lg font-semibold text-text">Autopsy</h1>
        <p className="mt-1 text-sm text-muted">
          Every post below your median views, worst performer first.
        </p>
      </div>

      {pillarPerformance.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-text">Performance by pillar</h2>
          <div className="overflow-hidden rounded-xl border border-border bg-panel">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-faint">
                  <th className="p-3 font-medium">Pillar</th>
                  <th className="p-3 font-medium">Posts</th>
                  <th className="p-3 font-medium">Avg views</th>
                  <th className="p-3 font-medium">Avg likes</th>
                  <th className="p-3 font-medium">Avg saves</th>
                  <th className="p-3 font-medium">Avg shares</th>
                </tr>
              </thead>
              <tbody>
                {pillarPerformance.map((row) => (
                  <tr key={row.pillar} className="border-b border-border last:border-0">
                    <td className="p-3 text-text">{row.pillar}</td>
                    <td className="p-3 text-muted">{row.post_count}</td>
                    <td className="p-3 text-text">{formatAvg(row.avg_views)}</td>
                    <td className="p-3 text-muted">{formatAvg(row.avg_likes)}</td>
                    <td className="p-3 text-muted">{formatAvg(row.avg_saves)}</td>
                    <td className="p-3 text-muted">{formatAvg(row.avg_shares)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-faint">
            Tag posts with a pillar from their post page to fill this in -- untagged posts group under &quot;Untagged&quot;.
          </p>
        </section>
      )}

      {posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-sm text-faint">
          Nothing below median right now.
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-panel">
          {posts.map((post) => {
            const deficitPct =
              post.median_views > 0
                ? ((post.median_views - post.views) / post.median_views) * 100
                : 0;
            return (
              <li key={post.id}>
                <Link
                  href={`/posts/${post.id}`}
                  className="flex items-center gap-3 p-3 hover:bg-panel-2"
                >
                  {post.thumb_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={post.thumb_url}
                      alt=""
                      className="h-14 w-10 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <div className="h-14 w-10 shrink-0 rounded-md bg-panel-2" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-text">
                      {post.caption || "No caption"}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className="text-xs text-faint">{post.happened_on}</p>
                      {post.pillar && (
                        <span className="rounded-full border border-border bg-panel-2 px-1.5 py-0.5 text-[10px] text-muted">
                          {post.pillar}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-warn">
                      {formatViews(post.views)} views
                    </p>
                    <p className="text-xs text-faint">
                      -{deficitPct.toFixed(0)}% vs. median
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
