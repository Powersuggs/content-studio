import { TrendingUp, CalendarCheck, Target } from "lucide-react";
import type { WeekProgress, GoalProgress } from "@/lib/game-plan/queries";

/**
 * How the week and the goal are actually going.
 *
 * "On track" is judged on pace, not on the raw total, so a Monday with
 * nothing posted is not reported as a failure. The number of posts still
 * needed is always shown regardless, because that is the actionable part
 * and it is true whether the week is going well or not.
 */
export default function Progress({
  week,
  goal,
}: {
  week: WeekProgress | null;
  goal: GoalProgress | null;
}) {
  if (!week && !goal) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-sm text-faint">
        No targets set yet. Put one in below and this turns into a read on
        whether you are keeping up.
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {week && (
        <div className="space-y-2 rounded-xl border border-border bg-panel p-4">
          <div className="flex items-center gap-2">
            <CalendarCheck size={16} strokeWidth={1.75} className="text-muted" />
            <h2 className="text-xs uppercase tracking-wide text-faint">
              This week
            </h2>
          </div>

          <p className="text-2xl font-semibold text-text">
            {week.posted}
            <span className="text-base font-normal text-faint"> / {week.target}</span>
          </p>

          <Bar value={week.posted / Math.max(week.target, 1)} ok={week.onTrack} />

          <p className={`text-xs ${week.onTrack ? "text-accent" : "text-warn"}`}>
            {week.short === 0
              ? "Target hit for the week."
              : week.onTrack
                ? `On track. ${week.short} to go.`
                : `Behind. ${week.short} to go.`}
          </p>
        </div>
      )}

      {goal && (
        <div className="space-y-2 rounded-xl border border-border bg-panel p-4">
          <div className="flex items-center gap-2">
            <Target size={16} strokeWidth={1.75} className="text-muted" />
            <h2 className="text-xs uppercase tracking-wide text-faint">
              Follower goal
            </h2>
          </div>

          <p className="text-2xl font-semibold text-text">
            {goal.current.toLocaleString()}
            <span className="text-base font-normal text-faint">
              {" "}
              / {goal.goal.toLocaleString()}
            </span>
          </p>

          <Bar value={goal.progress} ok />

          <p className="text-xs text-muted">
            {goal.achieved ? (
              <span className="text-accent">Goal reached.</span>
            ) : goal.daysLeft === 0 ? (
              <span className="text-warn">
                Date passed, {(goal.goal - goal.current).toLocaleString()} short.
              </span>
            ) : (
              <>
                {goal.daysLeft} day{goal.daysLeft === 1 ? "" : "s"} left.{" "}
                <span className="inline-flex items-center gap-1">
                  <TrendingUp size={11} strokeWidth={2} />
                  {goal.neededPerDay < 1
                    ? `${(goal.neededPerDay * 7).toFixed(1)} a week`
                    : `${goal.neededPerDay.toFixed(1)} a day`}{" "}
                  needed
                </span>
              </>
            )}
          </p>

          <p className="text-[10px] text-faint">
            Measured from {goal.baseline.toLocaleString()} when you set it.
          </p>
        </div>
      )}
    </div>
  );
}

function Bar({ value, ok }: { value: number; ok: boolean }) {
  const pct = Math.min(Math.max(value, 0), 1) * 100;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-2">
      <div
        className={`h-full rounded-full transition-all ${ok ? "bg-accent" : "bg-warn"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
