"use server";

import { revalidatePath } from "next/cache";
import { updateProfile, type UpdateProfileInput } from "@/lib/queries";

export async function updateProfileAction(input: UpdateProfileInput) {
  await updateProfile(input);
  revalidatePath("/dashboard");
}
