"use server";

import { revalidatePath } from "next/cache";
import { updateScriptStatus } from "@/lib/queries";

export async function markFilmedAction(id: number) {
  await updateScriptStatus(id, "filmed");
  revalidatePath("/session-mode");
}
