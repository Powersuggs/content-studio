"use server";

import { revalidatePath } from "next/cache";
import { updatePostPillar } from "@/lib/queries";

export async function updatePillarAction(postId: number, pillar: string | null) {
  await updatePostPillar(postId, pillar);
  revalidatePath(`/posts/${postId}`);
  revalidatePath("/history");
  revalidatePath("/autopsy");
}
