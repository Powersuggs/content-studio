"use server";

import { revalidatePath } from "next/cache";
import {
  addCollectedLeads,
  addLead,
  deleteLead,
  setLeadNote,
  setLeadStatus,
  type LeadStatus,
} from "@/lib/leads/queries";

export async function findLeadsAction(): Promise<{ added: number }> {
  const added = await addCollectedLeads();
  revalidatePath("/leads");
  return { added };
}

export async function addLeadAction(handle: string, note: string) {
  await addLead(handle, note);
  revalidatePath("/leads");
}

export async function setLeadStatusAction(id: number, status: LeadStatus) {
  await setLeadStatus(id, status);
  revalidatePath("/leads");
}

export async function setLeadNoteAction(id: number, note: string) {
  await setLeadNote(id, note);
  revalidatePath("/leads");
}

export async function deleteLeadAction(id: number) {
  await deleteLead(id);
  revalidatePath("/leads");
}
