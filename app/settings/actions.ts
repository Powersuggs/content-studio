"use server";

import { revalidatePath } from "next/cache";
import { addLendingFact, deleteLendingFact } from "@/lib/queries";

export async function addLendingFactAction(input: {
  fact: string;
  source_name: string;
  source_url: string;
}) {
  await addLendingFact({
    fact: input.fact,
    source_name: input.source_name || null,
    source_url: input.source_url || null,
  });
  revalidatePath("/settings");
}

export async function deleteLendingFactAction(id: number) {
  await deleteLendingFact(id);
  revalidatePath("/settings");
}
