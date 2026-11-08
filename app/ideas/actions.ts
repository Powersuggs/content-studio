"use server";

import { revalidatePath } from "next/cache";
import {
  createIdea,
  toggleOutput,
  archiveIdea,
  unarchiveIdea,
  saveSlidePlan,
} from "@/lib/ideas/queries";
import { isFormatId } from "@/lib/ideas/formats";

export async function createIdeaAction(input: {
  title: string;
  note?: string;
  /**
   * Where it came from. "capture" is him, "suggested" is a proposal he
   * kept. Worth recording: an idea he wrote himself and one the app
   * handed him are not the same thing when he looks back at which ones
   * actually became posts.
   */
  source?: string;
}): Promise<void> {
  await createIdea({ title: input.title, note: input.note, source: input.source });
  revalidatePath("/ideas");
}

export async function toggleOutputAction(
  ideaId: number,
  format: string,
): Promise<void> {
  await toggleOutput(ideaId, format);
  revalidatePath("/ideas");
}

export async function archiveIdeaAction(ideaId: number): Promise<void> {
  await archiveIdea(ideaId);
  revalidatePath("/ideas");
}

export async function unarchiveIdeaAction(ideaId: number): Promise<void> {
  await unarchiveIdea(ideaId);
  revalidatePath("/ideas");
}

export async function saveSlidePlanAction(
  ideaId: number,
  format: string,
  plan: unknown,
): Promise<void> {
  if (!isFormatId(format)) throw new Error(`Unknown format: ${format}`);
  await saveSlidePlan(ideaId, format, plan);
  revalidatePath("/ideas");
}
