"use server";

import { revalidatePath } from "next/cache";
import { createReferencePost, saveReferenceBreakdown } from "@/lib/queries";

export interface ReferenceBreakdown {
  hook: string;
  hook_type: string;
  skeleton: string[];
  pacing_notes: string;
  caption_pattern: string;
  why_it_works: string;
  reusable_template: string;
}

function formatBreakdown(b: ReferenceBreakdown): string {
  const skeleton = b.skeleton.map((beat, i) => `${i + 1}. ${beat}`).join("\n");
  return `Hook (${b.hook_type}): "${b.hook}"

Skeleton:
${skeleton}

Pacing: ${b.pacing_notes}

Caption pattern: ${b.caption_pattern}

Why it works: ${b.why_it_works}

Reusable template:
${b.reusable_template}`;
}

export interface SaveReferencePostInput {
  handle: string;
  url: string | null;
  caption: string | null;
  breakdown: ReferenceBreakdown | null;
}

export async function saveReferencePostAction(input: SaveReferencePostInput) {
  const handle = input.handle.trim();
  if (!handle) throw new Error("A creator handle is required");

  const post = await createReferencePost({
    platform: "reference",
    handle,
    url: input.url?.trim() || null,
    caption: input.caption?.trim() || null,
  });

  if (input.breakdown) {
    await saveReferenceBreakdown(post.id, handle, formatBreakdown(input.breakdown));
  }

  revalidatePath("/inspiration");
  return { id: post.id };
}
