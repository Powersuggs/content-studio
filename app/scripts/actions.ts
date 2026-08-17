"use server";

import { revalidatePath } from "next/cache";
import { updateScriptStatus } from "@/lib/queries";

export async function queueScriptAction(id: number) {
  await updateScriptStatus(id, "queued");
  revalidatePath("/session-mode");
}
