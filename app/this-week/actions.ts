"use server";

import { revalidatePath } from "next/cache";
import { scheduleDraft, unscheduleDraft, setPosted } from "@/lib/queue/queries";

export async function scheduleAction(input: {
  ideaId: number;
  format: string;
  day: string;
  slot: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const result = await scheduleDraft(input);
  revalidatePath("/this-week");
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

export async function unscheduleAction(ideaId: number, format: string): Promise<void> {
  await unscheduleDraft(ideaId, format);
  revalidatePath("/this-week");
}

export async function setPostedAction(
  ideaId: number,
  format: string,
  posted: boolean,
): Promise<void> {
  await setPosted(ideaId, format, posted);
  revalidatePath("/this-week");
  // The Ideas page shows the same drafts, so it has to be told as well.
  revalidatePath("/ideas");
}
