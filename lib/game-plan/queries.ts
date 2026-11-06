import { query, queryOne } from "@/lib/db";
import { currentAccountId } from "@/lib/auth/current-account";
import { DEFAULT_APP_TIMEZONE } from "@/lib/analytics-sql";

/**
 * Goals, and how far off them you are.
 *
 * The arithmetic lives here rather than in the page so there is one place
 * that decides what "behind" means. Scattering that across components is
 * how two screens end up disagreeing about whether the week is going well.
 */

export interface GamePlan {
  postsPerWeek: number | null;
  followerGoal: number | null;
  followerGoalDate: Date | null;
  followerBaseline: number | null;
}

export interface WeekProgress {
  target: number;
  posted: number;
  /** Posts still needed this week. Never negative. */
  short: number;
  /** How far through the week we are, 0 to 1, used to judge pace. */
  weekElapsed: number;
  /** True when the week is going to plan or better, judged on pace. */
  onTrack: boolean;
}

export interface GoalProgress {
  goal: number;
  current: number;
  baseline: number;
  /** 0 to 1 of the distance from baseline to goal. */
  progress: number;
  daysLeft: number;
  /** Followers a day still needed to land it on time. */
  neededPerDay: number;
  /** What the recent rate actually is, from the last 30 days. */
  achieved: boolean;
}

export async function getGamePlan(): Promise<GamePlan | null> {
  const accountId = await currentAccountId();
  const row = await queryOne<{
    posts_per_week: number | null;
    follower_goal: number | null;
    follower_goal_date: string | null;
    follower_baseline: number | null;
  }>(
    `select posts_per_week, follower_goal, follower_goal_date, follower_baseline
       from game_plan where account_id = $1`,
    [accountId],
  );
  if (!row) return null;
  return {
    postsPerWeek: row.posts_per_week,
    followerGoal: row.follower_goal,
    followerGoalDate: row.follower_goal_date ? new Date(row.follower_goal_date) : null,
    followerBaseline: row.follower_baseline,
  };
}

export async function saveGamePlan(input: {
  postsPerWeek: number | null;
  followerGoal: number | null;
  followerGoalDate: string | null;
}): Promise<void> {
  const accountId = await currentAccountId();

  // A goal is measured from where you were when you set it, so the
  // baseline is captured here. Re-reading it on every save would make the
  // goal look permanently 0% done as the count climbs, which is why this
  // only moves when the goal itself changes.
  const existing = await getGamePlan();
  const goalChanged =
    input.followerGoal !== existing?.followerGoal ||
    input.followerGoalDate !==
      (existing?.followerGoalDate?.toISOString().slice(0, 10) ?? null);

  let baseline = existing?.followerBaseline ?? null;
  if (input.followerGoal !== null && (goalChanged || baseline === null)) {
    const prof = await queryOne<{ followers_count: number }>(
      `select followers_count from profile where account_id = $1`,
      [accountId],
    );
    baseline = prof?.followers_count ?? 0;
  }
  if (input.followerGoal === null) baseline = null;

  await queryOne(
    `insert into game_plan (account_id, posts_per_week, follower_goal,
                            follower_goal_date, follower_baseline, goal_set_at)
     values ($1, $2, $3, $4, $5, case when $3::int is null then null else now() end)
     on conflict (account_id) do update set
       posts_per_week     = excluded.posts_per_week,
       follower_goal      = excluded.follower_goal,
       follower_goal_date = excluded.follower_goal_date,
       follower_baseline  = excluded.follower_baseline,
       goal_set_at        = coalesce(excluded.goal_set_at, game_plan.goal_set_at),
       updated_at         = now()
     returning account_id`,
    [
      accountId,
      input.postsPerWeek,
      input.followerGoal,
      input.followerGoalDate,
      baseline,
    ],
  );
}

/** Posts published since Monday, in the account's own timezone. */
export async function getPostsThisWeek(handle: string | null): Promise<number> {
  if (!handle) return 0;
  const accountId = await currentAccountId();
  const row = await queryOne<{ n: string }>(
    `select count(*) as n
       from posts
      where account_id = $1
        and handle = $2
        and posted_at >= date_trunc('week', (now() at time zone $3))`,
    [accountId, handle, DEFAULT_APP_TIMEZONE],
  );
  return Number(row?.n ?? 0);
}

export function weekProgress(
  target: number,
  posted: number,
  // Injectable so the pace rule can be tested at a known point in the week
  // rather than only ever on whatever day the suite happens to run.
  now: Date = new Date(),
): WeekProgress {
  // Monday 00:00 to Sunday 24:00, as a fraction. Judging "behind" against
  // the whole week's target on a Tuesday would mark every week behind
  // until Saturday, which is noise rather than information.
  const day = (now.getDay() + 6) % 7; // Monday = 0
  const elapsed = (day + now.getHours() / 24) / 7;

  const short = Math.max(target - posted, 0);
  const expectedByNow = target * elapsed;

  return {
    target,
    posted,
    short,
    weekElapsed: elapsed,
    // Rounded, not floored. Flooring is forgiving early in the week, which
    // is wanted, but it stays forgiving at the end of it: at 5 posts a week
    // and 4 done on Sunday evening, floor(4.88) is 4 and the week reads "on
    // track" an hour before it is missed. Rounding keeps the Monday-morning
    // grace and still calls Sunday honestly.
    onTrack: posted >= Math.round(expectedByNow),
  };
}

export function goalProgress(
  goal: number,
  goalDate: Date,
  baseline: number,
  current: number,
  now: Date = new Date(),
): GoalProgress {
  const span = Math.max(goal - baseline, 1);
  const gained = current - baseline;
  const msLeft = goalDate.getTime() - now.getTime();
  const daysLeft = Math.max(Math.ceil(msLeft / 86_400_000), 0);
  const remaining = Math.max(goal - current, 0);

  return {
    goal,
    current,
    baseline,
    progress: Math.min(Math.max(gained / span, 0), 1),
    daysLeft,
    neededPerDay: daysLeft > 0 ? remaining / daysLeft : remaining,
    achieved: current >= goal,
  };
}

