import Link from "next/link";
import { getPostsBelowMedianViews } from "@/lib/queries";

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default async function AutopsyPage() {
  const posts = await getPostsBelowMedianViews();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-lg font-semibold text-text">Autopsy</h1>
        <p className="mt-1 text-sm text-muted">
          Every post below your median views, worst performer first.
        </p>
      </div>

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
                    <p className="text-xs text-faint">{post.happened_on}</p>
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
