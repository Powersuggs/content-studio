import { ExternalLink } from "lucide-react";
import type { RecentPost } from "@/lib/queries";

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K views`;
  return `${n} views`;
}

function formatDate(day: string): string {
  // day is a raw YYYY-MM-DD string -- parse as local calendar parts,
  // never via `new Date(isoString)` interpretation across a UTC boundary.
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function RecentPostsRail({ posts }: { posts: RecentPost[] }) {
  if (posts.length === 0) {
    return (
      <section>
        <h2 className="mb-3 text-sm font-semibold text-text">Recent posts</h2>
        <div className="rounded-xl border border-dashed border-border p-6 text-sm text-faint">
          No posts imported for your handle yet.
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-text">Recent posts</h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {posts.map((post) => (
          <a
            key={post.id}
            href={post.url ?? undefined}
            target="_blank"
            rel="noreferrer"
            className="group flex w-40 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-panel transition-colors hover:border-accent/50"
          >
            <div className="relative aspect-[9/16] w-full bg-panel-2">
              {post.thumb_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.thumb_url}
                  alt={post.caption ?? "Post thumbnail"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-faint">
                  No thumbnail
                </div>
              )}
              <div className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                <ExternalLink size={12} className="text-white" />
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-1 p-2.5">
              <p className="line-clamp-2 text-xs text-text">
                {post.caption || <span className="text-faint">No caption</span>}
              </p>
              <div className="mt-auto flex items-center justify-between pt-1 text-[11px] text-muted">
                <span>{formatViews(post.views)}</span>
                <span>{formatDate(post.happened_on)}</span>
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
