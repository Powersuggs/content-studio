import ProfileHeader from "@/components/dashboard/ProfileHeader";
import RecentPostsRail from "@/components/dashboard/RecentPostsRail";
import InsightCards from "@/components/dashboard/InsightCards";
import StatTiles from "@/components/dashboard/StatTiles";
import AveragesRow from "@/components/dashboard/AveragesRow";
import Heatmap from "@/components/dashboard/Heatmap";
import SyncButton from "@/components/dashboard/SyncButton";
import {
  getProfileHeader,
  getRecentPosts,
  getRecentInsights,
  getAllTimeStats,
  getAveragesLast30Days,
  getPostingHeatmap,
  getSyncStatus,
} from "@/lib/queries";
import { getMyHandle } from "@/lib/my-handle";
import { DEFAULT_APP_TIMEZONE } from "@/lib/analytics-sql";

export default async function DashboardPage() {
  const handle = await getMyHandle();
  const profile = await getProfileHeader();
  const syncStatus = await getSyncStatus();

  // Everything past this point requires a handle to be scoped safely.
  // Without one there's no "mine" to filter by, so show setup guidance
  // instead of ever falling back to an unscoped, cross-creator query.
  if (!handle) {
    return (
      <div className="mx-auto max-w-5xl space-y-8 p-4 md:p-8">
        <div className="flex justify-end">
          <SyncButton initialLastSyncedAt={syncStatus.last_synced_at} />
        </div>
        <ProfileHeader data={profile} />
        <div className="rounded-xl border border-dashed border-border p-6 text-sm text-faint">
          Set your Instagram handle above to unlock stats, posts, and AI
          insights scoped to your own account. Reference posts you import
          from other creators will never count toward these numbers.
        </div>
      </div>
    );
  }

  const [recentPosts, insights, allTimeStats, averages, heatmapDays] =
    await Promise.all([
      getRecentPosts(),
      getRecentInsights(),
      getAllTimeStats(),
      getAveragesLast30Days(),
      getPostingHeatmap(),
    ]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 md:p-8">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-faint">
          {syncStatus.last_synced_at
            ? `Last synced ${new Date(syncStatus.last_synced_at).toLocaleString("en-US", { timeZone: DEFAULT_APP_TIMEZONE, dateStyle: "medium", timeStyle: "short" })}`
            : "Never synced"}
        </p>
        <SyncButton initialLastSyncedAt={syncStatus.last_synced_at} />
      </div>
      <ProfileHeader data={profile} />
      <RecentPostsRail posts={recentPosts} />
      <InsightCards insights={insights} />
      <StatTiles stats={allTimeStats} />
      <AveragesRow averages={averages} />
      <Heatmap days={heatmapDays} />
    </div>
  );
}
