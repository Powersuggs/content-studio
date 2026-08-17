import Link from "next/link";
import { PenLine, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { getPostingCadence, getTopPostsForRemake } from "@/lib/queries";

function ChangeBadge({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <span className="inline-flex items-center gap-1 text-xs text-faint"><Minus size={12} /> no prior data</span>;
  }
  const positive = pct > 0;
  const flat = Math.abs(pct) < 0.5;
  const color = flat ? "text-muted" : positive ? "text-accent" : "text-warn";
  const Icon = flat ? Minus : positive ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}>
      <Icon size={12} /> {Math.abs(pct).toFixed(0)}% vs. prior 30 days
    </span>
  );
}

export default async function SessionPrepPage() {
  const [cadence, topPosts] = await Promise.all([
    getPostingCadence(),
    getTopPostsForRemake(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 md:p-8">
      <div>
        <h1 className="text-lg font-semibold text-text">Session Prep</h1>
        <p className="mt-1 text-sm text-muted">Where you stand before you sit down to film.</p>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-panel p-4">
          <p className="text-xs text-faint">Posts (30d)</p>
          <p className="mt-1 text-xl font-semibold text-text">{cadence.posts_last_30}</p>
        </div>
        <div className="rounded-lg border border-border bg-panel p-4">
          <p className="text-xs text-faint">Days posted</p>
          <p className="mt-1 text-xl font-semibold text-text">{cadence.distinct_days_last_30}/30</p>
        </div>
        <div className="rounded-lg border border-border bg-panel p-4">
          <p className="text-xs text-faint">Days missed</p>
          <p className="mt-1 text-xl font-semibold text-warn">{cadence.days_missed_last_30}</p>
        </div>
        <div className="rounded-lg border border-border bg-panel p-4">
          <p className="text-xs text-faint">vs. prior 30</p>
          <div className="mt-2"><ChangeBadge pct={cadence.pct_change_posts} /></div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-text">Remake candidates</h2>
        <p className="mb-3 text-xs text-faint">Your top posts by views -- good bets to run back.</p>
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-panel">
          {topPosts.map((post) => (
            <li key={post.id} className="flex items-center gap-3 p-3">
              {post.thumb_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.thumb_url} alt="" className="h-14 w-10 shrink-0 rounded-md object-cover" />
              ) : (
                <div className="h-14 w-10 shrink-0 rounded-md bg-panel-2" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text">{post.caption || "No caption"}</p>
                <p className="text-xs text-faint">{post.happened_on} · {post.views.toLocaleString()} views</p>
              </div>
              <Link
                href={`/scripts?modelPostId=${post.id}`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-panel-2 px-3 py-1.5 text-xs text-text hover:border-accent/50"
              >
                <PenLine size={13} /> Remake
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
