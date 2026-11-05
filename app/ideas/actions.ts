"use server";

import { revalidatePath } from "next/cache";
import { createIdea, toggleOutput, archiveIdea } from "@/lib/ideas/queries";

export async function createIdeaAction(input: {
  title: string;
  note?: string;
}): Promise<void> {
  await createIdea({ title: input.title, note: input.note });
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
