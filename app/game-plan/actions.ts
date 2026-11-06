"use server";

import { revalidatePath } from "next/cache";
import { saveGamePlan } from "@/lib/game-plan/queries";

export async function saveGamePlanAction(input: {
  postsPerWeek: number | null;
  followerGoal: number | null;
  followerGoalDate: string | null;
}): Promise<void> {
  // A target with no date cannot produce a pace and a date with no target
  // is a deadline for nothing, so the pair is enforced here as well as by
  // the database constraint.
  const bothOrNeither =
    input.followerGoal !== null && input.followerGoalDate
      ? input
      : { ...input, followerGoal: null, followerGoalDate: null };

  await saveGamePlan(bothOrNeither);
  revalidatePath("/game-plan");
  revalidatePath("/dashboard");
}
