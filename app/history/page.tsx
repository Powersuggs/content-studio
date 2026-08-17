import Link from "next/link";
import { getAllMyPostsHistory } from "@/lib/queries";

export default async function HistoryPage() {
  const posts = await getAllMyPostsHistory();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-lg font-semibold text-text">History</h1>
        <p className="mt-1 text-sm text-muted">Every one of your posts, newest first.</p>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-sm text-faint">
          No posts imported for your handle yet.
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-panel">
          {posts.map((post) => (
            <li key={post.id}>
              <Link href={`/posts/${post.id}`} className="flex items-center gap-3 p-3 hover:bg-panel-2">
                {post.thumb_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={post.thumb_url} alt="" className="h-14 w-10 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="h-14 w-10 shrink-0 rounded-md bg-panel-2" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-text">{post.caption || "No caption"}</p>
                  <p className="text-xs text-faint">{post.happened_on}</p>
                </div>
                <p className="shrink-0 text-sm text-muted">{post.views.toLocaleString()} views</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
