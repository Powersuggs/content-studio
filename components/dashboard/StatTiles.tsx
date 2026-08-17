import type { AllTimeStats } from "@/lib/queries";

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

export default function StatTiles({ stats }: { stats: AllTimeStats }) {
  const tiles: { label: string; value: string }[] = [
    { label: "Posts", value: formatCount(stats.total_posts) },
    { label: "Total views", value: formatCount(stats.total_views) },
    { label: "Total likes", value: formatCount(stats.total_likes) },
    { label: "Total comments", value: formatCount(stats.total_comments) },
    { label: "Total saves", value: formatCount(stats.total_saves) },
    { label: "Total shares", value: formatCount(stats.total_shares) },
    { label: "Average views", value: formatCount(stats.average_views) },
  ];

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-text">All time</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-lg border border-border bg-panel p-4"
          >
            <p className="text-xs text-faint">{tile.label}</p>
            <p className="mt-1 text-xl font-semibold text-text">{tile.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
