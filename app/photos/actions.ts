"use server";

import { revalidatePath } from "next/cache";
import { deletePhoto, updatePhoto } from "@/lib/photos/queries";

export async function updatePhotoAction(
  id: number,
  input: { label?: string; tags?: string; kind?: "person" | "scene" },
): Promise<void> {
  await updatePhoto(id, input);
  revalidatePath("/photos");
}

export async function deletePhotoAction(id: number): Promise<void> {
  await deletePhoto(id);
  revalidatePath("/photos");
}
