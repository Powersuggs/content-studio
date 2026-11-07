"use server";

import { revalidatePath } from "next/cache";
import { addVerifiedFact, deleteVerifiedFact } from "@/lib/queries";
import { saveHandle } from "@/lib/social/handles";
import { createInvite, revokeInvite } from "@/lib/auth/invites";
import { getSession } from "@/lib/auth/current-account";
import { OWNER_ACCOUNT_ID } from "@/lib/auth/session";

export async function addVerifiedFactAction(input: {
  fact: string;
  topic: string;
  source_name: string;
  source_url: string;
}) {
  await addVerifiedFact({
    fact: input.fact,
    topic: input.topic || null,
    source_name: input.source_name || null,
    source_url: input.source_url || null,
  });
  revalidatePath("/settings");
}

export async function deleteVerifiedFactAction(id: number) {
  await deleteVerifiedFact(id);
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

/**
 * Only the owner issues invites. Checked here rather than only in the UI:
 * hiding a button does not stop anyone calling the action directly.
 */
async function assertOwner(): Promise<void> {
  const session = await getSession();
  if (!session || session.accountId !== OWNER_ACCOUNT_ID) {
    throw new Error("Only the owner can manage invite codes.");
  }
}

export async function createInviteAction(input: {
  note?: string;
  maxUses?: number;
}): Promise<string> {
  await assertOwner();
  const code = await createInvite(input);
  revalidatePath("/settings");
  return code;
}

export async function revokeInviteAction(code: string): Promise<void> {
  await assertOwner();
  await revokeInvite(code);
  revalidatePath("/settings");
}
