"use server";

import { revalidatePath } from "next/cache";
import { addPattern, deletePattern, setPatternActive } from "@/lib/hooks/patterns";

export async function addPatternAction(input: {
  name: string;
  source?: string;
  whatItDoes: string;
  example?: string;
}): Promise<void> {
  await addPattern(input);
  revalidatePath("/hooks");
}

export async function setPatternActiveAction(id: number, active: boolean): Promise<void> {
  await setPatternActive(id, active);
  revalidatePath("/hooks");
}

export async function deletePatternAction(id: number): Promise<void> {
  await deletePattern(id);
  revalidatePath("/hooks");
}
