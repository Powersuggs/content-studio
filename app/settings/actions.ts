"use server";

import { revalidatePath } from "next/cache";
import { addLendingFact, deleteLendingFact } from "@/lib/queries";
import { saveHandle } from "@/lib/social/handles";

export async function addLendingFactAction(input: {
  fact: string;
  loan_type: string;
  source_name: string;
  source_url: string;
}) {
  await addLendingFact({
    fact: input.fact,
    loan_type: input.loan_type || null,
    source_name: input.source_name || null,
    source_url: input.source_url || null,
  });
  revalidatePath("/settings");
}

export async function deleteLendingFactAction(id: number) {
  await deleteLendingFact(id);
  revalidatePath("/settings");
}

/**
 * Saves one platform's handle. An empty value removes it, which is what
 * clearing the box and pressing save is understood to mean.
 */
export async function saveSocialHandleAction(
  platform: string,
  handle: string,
): Promise<void> {
  await saveHandle(platform, handle);
  revalidatePath("/settings");
}
