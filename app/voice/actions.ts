"use server";

import { revalidatePath } from "next/cache";
import { saveVoiceAnswer, deleteVoiceAnswer } from "@/lib/voice/profile";

export async function saveAnswerAction(input: {
  questionKey: string;
  answerText: string;
  source: "typed" | "spoken";
  rawTranscript?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await saveVoiceAnswer(input);
    revalidatePath("/voice");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save." };
  }
}

export async function deleteAnswerAction(
  questionKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await deleteVoiceAnswer(questionKey);
    revalidatePath("/voice");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not delete." };
  }
}
