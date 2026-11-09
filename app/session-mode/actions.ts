"use server";

import { revalidatePath } from "next/cache";
import { updateScriptStatus } from "@/lib/queries";

export async function markFilmedAction(id: number) {
  await updateScriptStatus(id, "filmed");
  revalidatePath("/session-mode");
}

/**
 * Puts a script back in the queue.
 *
 * Done was a one way door with no warning: Aaron pressed it twice while
 * trying things out and both scripts vanished from the teleprompter with
 * nothing on screen explaining where they went or how to get them back.
 * Nothing was lost, the rows were only marked filmed, but a button that
 * empties your screen needs a way back next to it.
 */
export async function unfilmScriptAction(id: number) {
  await updateScriptStatus(id, "queued");
  revalidatePath("/session-mode");
}
