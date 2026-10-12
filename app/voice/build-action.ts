"use server";

import { revalidatePath } from "next/cache";
import { synthesizeVoiceProfile } from "@/lib/voice/synthesize";

export async function buildProfileAction(): Promise<
  { ok: true; summary: string; answersUsed: number; postsAnalysed: number }
  | { ok: false; error: string }
> {
  try {
    const result = await synthesizeVoiceProfile();
    revalidatePath("/voice");
    return { ok: true, ...result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not build the profile.",
    };
  }
}
