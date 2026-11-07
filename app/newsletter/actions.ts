"use server";

import { revalidatePath } from "next/cache";
import {
  updateNewsletter,
  deleteNewsletter,
  type NewsletterStatus,
} from "@/lib/newsletter/queries";

export async function saveNewsletterEditAction(
  id: number,
  input: { subject?: string; body?: string },
): Promise<void> {
  await updateNewsletter(id, input);
  revalidatePath("/newsletter");
}

export async function setNewsletterStatusAction(
  id: number,
  status: NewsletterStatus,
): Promise<void> {
  await updateNewsletter(id, { status });
  revalidatePath("/newsletter");
}

export async function deleteNewsletterAction(id: number): Promise<void> {
  await deleteNewsletter(id);
  revalidatePath("/newsletter");
}
