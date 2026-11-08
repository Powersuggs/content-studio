"use server";

import { revalidatePath } from "next/cache";
import { updateScriptStatus } from "@/lib/queries";

export async function queueScriptAction(id: number) {
  await updateScriptStatus(id, "queued");
  revalidatePath("/session-mode");
  // The Ideas page shows whether a written reel is in the queue, so it
  // has to be told as well. Without this the button comes back unpressed
  // on the next load and he queues the same script twice.
  revalidatePath("/ideas");
}
