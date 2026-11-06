import {
  getGamePlan,
  getPostsThisWeek,
  weekProgress,
  goalProgress,
} from "@/lib/game-plan/queries";
import { getProfileHeader } from "@/lib/queries";
import GamePlanForm from "@/components/game-plan/GamePlanForm";
import Progress from "@/components/game-plan/Progress";

export const dynamic = "force-dynamic";

export default async function GamePlanPage() {
  const profile = await getProfileHeader();
  const [plan, postedThisWeek] = await Promise.all([
    getGamePlan(),
    getPostsThisWeek(profile.handle),
  ]);

  const week =
    plan?.postsPerWeek != null
      ? weekProgress(plan.postsPerWeek, postedThisWeek)
      : null;

  const goal =
    plan?.followerGoal != null && plan.followerGoalDate
      ? goalProgress(
          plan.followerGoal,
          plan.followerGoalDate,
          plan.followerBaseline ?? 0,
          profile.followers_count,
        )
      : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-lg font-semibold text-text">Game Plan</h1>
        <p className="mt-1 text-sm text-muted">
          Your dashboard is full of numbers that do not mean anything on
          their own. Put a target next to them and it can tell you when you
          are behind, which is the only version that changes what you do
          today.
        </p>
      </div>

      <Progress week={week} goal={goal} />

      <GamePlanForm
        postsPerWeek={plan?.postsPerWeek ?? null}
        followerGoal={plan?.followerGoal ?? null}
        followerGoalDate={
          plan?.followerGoalDate
            ? plan.followerGoalDate.toISOString().slice(0, 10)
            : null
        }
        currentFollowers={profile.followers_count}
      />
    </div>
  );
}
