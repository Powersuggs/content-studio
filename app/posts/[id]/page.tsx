import Link from "next/link";
import { ExternalLink, PenLine } from "lucide-react";
import { getMyPostById, getMyMedianRates, getDistinctPillars } from "@/lib/queries";
import PostAnalyticsPanel from "@/components/posts/PostAnalyticsPanel";
import ReviewButton from "@/components/posts/ReviewButton";
import PillarTag from "@/components/posts/PillarTag";

const VERDICT_STYLE: Record<string, string> = {
  win: "bg-accent/15 text-accent border-accent/30",
  flop: "bg-warn/15 text-warn border-warn/30",
  ok: "bg-idea/15 text-idea border-idea/30",
};

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const postId = Number(id);
  const post = await getMyPostById(postId);

  if (!post) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-8">
        <p className="text-sm text-faint">Post not found for your handle.</p>
      </div>
    );
  }

  const medians = await getMyMedianRates();
  const pillarSuggestions = await getDistinctPillars();

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {post.thumb_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.thumb_url}
            alt=""
            className="h-40 w-24 shrink-0 rounded-lg border border-border object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-text">Post #{post.id}</h1>
            {post.verdict && (
              <span
                className={`rounded-full border px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${
                  VERDICT_STYLE[post.verdict] ?? VERDICT_STYLE.ok
                }`}
              >
                {post.verdict}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">{post.happened_on}</p>
          <p className="mt-2 text-sm text-text">{post.caption || "No caption"}</p>
          <div className="mt-3">
            <PillarTag postId={post.id} pillar={post.pillar} suggestions={pillarSuggestions} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {post.url && (
              <a
                href={post.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-panel-2 px-3 py-1.5 text-xs text-text hover:border-accent/50"
              >
                <ExternalLink size={13} /> View original
              </a>
            )}
            <Link
              href={`/scripts?modelPostId=${post.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-panel-2 px-3 py-1.5 text-xs text-text hover:border-accent/50"
            >
              <PenLine size={13} /> Remake this
            </Link>
            <ReviewButton postId={post.id} />
          </div>
        </div>
      </div>

      {post.review && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-text">AI review</h2>
          <div className="rounded-lg border border-border bg-panel p-4 text-sm text-text">
            {post.review}
          </div>
        </section>
      )}

      <PostAnalyticsPanel post={post} medians={medians} />
    </div>
  );
}
