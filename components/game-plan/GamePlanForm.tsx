"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { saveGamePlanAction } from "@/app/game-plan/actions";

/**
 * Setting the targets.
 *
 * Both goal fields clear together. A follower target with no date gives
 * nothing to pace against, and a date with no target is a deadline for
 * nothing, so the form will not let you keep half of one.
 */
export default function GamePlanForm({
  postsPerWeek,
  followerGoal,
  followerGoalDate,
  currentFollowers,
}: {
  postsPerWeek: number | null;
  followerGoal: number | null;
  followerGoalDate: string | null;
  currentFollowers: number;
}) {
  const [posts, setPosts] = useState(postsPerWeek?.toString() ?? "");
  const [goal, setGoal] = useState(followerGoal?.toString() ?? "");
  const [date, setDate] = useState(followerGoalDate ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    const postsNum = posts.trim() === "" ? null : Number(posts);
    const goalNum = goal.trim() === "" ? null : Number(goal);

    if (postsNum !== null && (!Number.isFinite(postsNum) || postsNum < 0)) {
      setError("Posts a week has to be a number, zero or more.");
      return;
    }
    if (goalNum !== null && !date) {
      setError("A follower goal needs a date to aim at, or it cannot tell you the pace.");
      return;
    }
    if (goalNum !== null && goalNum <= currentFollowers) {
      setError(
        `You are already at ${currentFollowers.toLocaleString()}. Pick a number above that.`,
      );
      return;
    }

    setError(null);
    startTransition(async () => {
      await saveGamePlanAction({
        postsPerWeek: postsNum,
        followerGoal: goalNum,
        followerGoalDate: goalNum === null ? null : date,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-panel p-4">
      <h2 className="text-sm font-semibold text-text">Set your targets</h2>

      <label className="block space-y-1">
        <span className="text-xs text-muted">Posts a week</span>
        <input
          type="number"
          min={0}
          max={100}
          value={posts}
          onChange={(e) => setPosts(e.target.value)}
          placeholder="e.g. 5"
          className="w-32 rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none placeholder:text-faint focus:border-accent"
        />
        <span className="block text-[11px] text-faint">
          Leave empty for no weekly target.
        </span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs text-muted">Follower goal</span>
          <input
            type="number"
            min={0}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder={`more than ${currentFollowers}`}
            className="w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none placeholder:text-faint focus:border-accent"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted">By when</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
        </label>
      </div>

      {error && <p className="text-xs text-warn">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-bg disabled:opacity-60"
        >
          {saved ? (
            <span className="flex items-center gap-1">
              <Check size={14} /> Saved
            </span>
          ) : isPending ? (
            "Saving"
          ) : (
            "Save targets"
          )}
        </button>
        <p className="text-[11px] text-faint">
          You are at {currentFollowers.toLocaleString()} followers now.
        </p>
      </div>
    </div>
  );
}
